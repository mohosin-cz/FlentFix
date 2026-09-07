// Turns what an inspector recorded into what a landlord is being billed for.
//
// The two are not the same sentence. An inspection records a FAULT, in the
// shorthand of somebody standing in the room with a phone: "Socket dead",
// "Not working", "Other", "Needs replacement". Pulled straight onto an invoice
// those become lines like "Living Room — Not working  ₹1,240", which tells the
// person paying nothing at all about what anyone did in their house.
//
// The work is already in the record, just spread across columns the invoice was
// never reading: item_name says WHAT ("AC Point", "Tap / Basin Mixer"), action
// and fix_type say WHAT WAS DONE ("Replace", "Tighten the screws and change the
// filter"), material_description says WITH WHAT ("6in SS Tower Bolt"), area says
// WHERE. This reads those together and writes the one line an invoice wants.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: it may only re-describe. It cannot add
// a line, remove a line, change a price, or decide anything is billable — the
// pull decides that from verified work orders, and the amount comes from the
// inspection. The output schema has one writable field per line and it is
// prose. Nothing here writes to the database either: it returns descriptions,
// the browser puts them in a draft invoice, and a person reads that draft
// before anyone sees it. A bad sentence costs an edit, not a wrong invoice.
//
// It holds no service-role key. Work orders and inspections are readable by any
// signed-in staff member, so the caller's own JWT does all the reading and this
// function can never see more than the person who pressed the button. The ids
// come from the caller, but the words the model sees come from the database —
// so nobody can hand it a paragraph of their own to rewrite.
//
// Required secret (Supabase → Project Settings → Edge Functions):
//   ANTHROPIC_API_KEY — the same one design-scope-extract already uses.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// One invoice's worth. A property with more verified lines than this is not a
// case to spend a larger request on quietly — the caller gets the first 150
// rewritten and is told the rest were left alone.
const MAX_LINES = 150;

// ── what comes back ─────────────────────────────────────────────────────────
// One line per item, and nothing else. No price, no quantity, no decision about
// whether to bill: those are not this function's to have an opinion about, and
// the way to guarantee that is a schema with nowhere to put one.
const Line = z.object({
  // Echoed back so a description cannot land on the wrong row. Anything that is
  // not an id we sent is dropped below.
  id: z.string(),
  // The invoice line. What was done, to what, where.
  description: z.string(),
  // low when the record named no action and the sentence is carrying the item
  // and the room alone — those are the ones worth a human's eye before sending.
  confidence: z.enum(["high", "medium", "low"]),
});
const Rewrite = z.object({ lines: z.array(Line) });

const SYSTEM =
  `You write the line items on a repair invoice sent to a landlord in India.

Each input record is one job a vendor did and a staff member signed off. The records were typed by an inspector standing in the property, so they describe the FAULT in shorthand. Your job is to write what was DONE, in a sentence the person paying will understand.

The facts are spread across the fields:
- item is the thing ("AC Point", "Tap / Basin Mixer", "Cabinet Hinge")
- area is the room
- fault is what was wrong, in the inspector's words
- action is what was done about it, when it was recorded
- material is what was fitted, when something was

Rules:
- Describe the work, not the complaint. item "AC Point", area "Bedroom 2", fault "Socket dead", action "Repair" becomes "Repaired AC point socket in Bedroom 2" — never "Socket dead".
- Use ONLY what the record contains. If no action was recorded, do not invent one: name the item, the room and the plainest thing the fault implies was needed, and mark the line low confidence. "Requires inspection" with no action is not a repair and must not be written as one.
- Name the room when the area is a room. "Cleaning", "Whole property" and similar are not rooms — leave them out rather than writing "in Cleaning".
- Include what was fitted when material says: "Replaced shower head in the bathroom — 4 inch round". Keep it to the part, not the invoice code.
- Plain English, not trade shorthand. A landlord knows 'tower bolt on the bathroom door', not '6in SS TB'. Expand abbreviations. Do not use a brand name unless the material field gives one.
- One line, 4 to 12 words, sentence case, no full stop at the end.
- Never mention costs, rates, quantities, vendors, work order numbers or dates. Never write anything the record does not support.
- confidence: high when the action was recorded and is specific; medium when the action is a bare word like "Replace" and the item makes it obvious; low when no action was recorded at all, or the fault is uninformative ("Other", "Requires inspection").

Return exactly one line for every record, with the id copied back unchanged.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "Sign in first" }, 401);

  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON } });
  if (!who.ok) return json({ ok: false, error: "Sign in first" }, 401);
  const user = await who.json();
  if (!user?.email) return json({ ok: false, error: "Sign in first" }, 401);

  if (!KEY) {
    // A setup step, not a bug — say exactly what to do.
    return json({
      ok: false,
      error: "ANTHROPIC_API_KEY isn’t set — add it in Supabase → Edge Functions → Secrets, then try again.",
    }, 200);
  }

  let ids: string[] = [];
  try {
    const body = await req.json();
    ids = Array.isArray(body?.wo_item_ids) ? body.wo_item_ids.map(String) : [];
  } catch { /* handled by the empty check */ }

  // A UUID or it does not go into a query string.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  ids = [...new Set(ids.filter((id) => UUID.test(id)))];
  const skipped = Math.max(0, ids.length - MAX_LINES);
  ids = ids.slice(0, MAX_LINES);
  if (!ids.length) return json({ ok: true, descriptions: {}, empty: true });

  // ── read, as the caller ───────────────────────────────────────────────────
  const rest = (path: string) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { Authorization: auth, apikey: ANON } });

  const inList = `(${ids.join(",")})`;
  const iRes = await rest(
    `work_order_items?id=in.${inList}` +
      `&select=id,area,description,fix_type,material,inspection_line_item_id,work_orders(trade)`,
  );
  if (!iRes.ok) return json({ ok: false, error: `Could not read the work orders (${iRes.status})` }, 200);
  const items: Array<Record<string, any>> = await iRes.json();
  if (!items.length) return json({ ok: true, descriptions: {}, empty: true });

  // No foreign key from a work order item to the inspection row it was
  // snapshotted from, so this is a second read joined here rather than embedded.
  const inspIds = [...new Set(items.map((i) => i.inspection_line_item_id).filter(Boolean))].map(String);
  const byInsp = new Map<string, Record<string, any>>();
  if (inspIds.length) {
    const lRes = await rest(
      `inspection_line_items?id=in.(${inspIds.join(",")})` +
        `&select=id,area,item_name,trade,issue_description,action,material_description`,
    );
    if (lRes.ok) {
      for (const r of (await lRes.json()) as Array<Record<string, any>>) byInsp.set(String(r.id), r);
    }
  }

  const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

  const records = items.map((it) => {
    const src = it.inspection_line_item_id ? byInsp.get(String(it.inspection_line_item_id)) : null;
    return {
      id: String(it.id),
      trade: clean(it.work_orders?.trade || src?.trade),
      area: clean(it.area || src?.area),
      item: clean(src?.item_name),
      fault: clean(it.description || src?.issue_description),
      action: clean(it.fix_type || src?.action),
      material: clean(it.material || src?.material_description),
    };
  });

  const asText = records.map((r) =>
    [
      `id: ${r.id}`,
      r.trade && `trade: ${r.trade}`,
      r.area && `area: ${r.area}`,
      r.item && `item: ${r.item}`,
      r.fault && `fault: ${r.fault}`,
      r.action && `action: ${r.action}`,
      r.material && `material: ${r.material}`,
    ].filter(Boolean).join("\n")
  ).join("\n\n");

  // ── ask ───────────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: KEY });
  let parsed: z.infer<typeof Rewrite> | null = null;
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(Rewrite, "rewrite") },
      messages: [{
        role: "user",
        content: `Write the invoice line for each of these ${records.length} records.\n\n${asText}`,
      }],
    });
    if (response.stop_reason === "refusal") {
      return json({ ok: false, error: "The request was declined. The pulled descriptions are unchanged." }, 200);
    }
    parsed = response.parsed_output ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: `Rewriting the descriptions failed — ${msg}` }, 200);
  }
  if (!parsed) return json({ ok: false, error: "Nothing readable came back." }, 200);

  // ── sanity, ours not theirs ───────────────────────────────────────────────
  // An id we did not send is dropped rather than mapped to its nearest match: a
  // description on the wrong line is a wrong invoice, and a missing one just
  // leaves that line as it was pulled.
  const known = new Set(ids);
  const descriptions: Record<string, { description: string; confidence: string }> = {};
  for (const l of parsed.lines || []) {
    const id = String(l.id || "");
    if (!known.has(id) || descriptions[id]) continue;
    const description = clean(l.description).slice(0, 160).replace(/[.\s]+$/, "");
    if (!description) continue;
    descriptions[id] = { description, confidence: l.confidence };
  }

  return json({ ok: true, descriptions, skipped, by: user.email });
});
