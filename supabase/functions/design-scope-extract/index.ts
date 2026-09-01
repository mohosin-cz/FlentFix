// Reads a designer's brief — her words and her photographs — and proposes the
// work order lines somebody would otherwise tick in by hand.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: the model says WHAT and HOW MANY.
// It is never asked how long anything takes, and the output schema below has no
// field it could put a duration in. Durations come from task_catalogue, set by a
// human, once. A model will produce a confident number and somebody will roster
// against it; the way to prevent that is not a careful prompt, it is a schema
// with nowhere to write it.
//
// Nothing here writes to the database. It returns proposals; the browser adds
// the ones a person accepts, through design_scope_add, under that person's own
// session. So an extraction that goes wrong costs a scroll, not a cleanup.
//
// It also holds no service-role key. designer_brief and task_catalogue are both
// readable by any signed-in staff member and inspection-media is a public
// bucket, so the caller's own JWT does all the reading — this function can never
// see more than the person who pressed the button.
//
// Required secret (Supabase → Project Settings → Edge Functions):
//   ANTHROPIC_API_KEY — from console.anthropic.com
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

// Bounds, so one brief with forty photographs cannot become a very expensive
// request nobody asked for.
const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 4_500_000;

const MEDIA: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

// ── what comes back ─────────────────────────────────────────────────────────
// Note what is absent: minutes, hours, duration, effort. Deliberately.
const Proposal = z.object({
  // The catalogue row this is, or "" when it is not in the catalogue. An empty
  // string rather than null: nothing is guessed into the nearest row, because a
  // wrong match is worse than an unmatched line — the unmatched one gets looked
  // at, the wrong one gets ticked.
  catalogue_id: z.string(),
  // What she asked for, in her words — shown even when matched, because
  // "Wall shelf" and "three floating shelves over the desk" are not the same
  // sentence to the person reviewing.
  label: z.string(),
  quantity: z.number(),
  // Must be one of the areas given. "Whole property" when it belongs to no room.
  area: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  // The exact words she wrote, so review is reading her line, not trusting mine.
  source_quote: z.string(),
  // The photo path this came from, or "" when it came from text only.
  source_photo: z.string(),
});
const Extraction = z.object({ proposals: z.array(Proposal) });

const SYSTEM = `You read an interior designer's brief for one property and list the individual jobs it implies, so a person can tick them into work orders.

You decide WHAT and HOW MANY. You never decide how long anything takes — that is looked up from a catalogue afterwards, and you have no field to put it in.

Rules:
- One proposal per distinct job. "Bed, wardrobe, side tables" is three proposals, not one.
- quantity is a count of units. Two side tables is quantity 2 in one proposal, not two proposals.
- Match to the catalogue by name OR alias. If nothing in the catalogue is clearly the same job, return catalogue_id "" and describe it in label. Do not force a near match — an unmatched line gets a human's attention, a wrong match gets ticked through.
- area must be copied exactly from the list of areas given. Use "Whole property" for anything that belongs to no single room.
- source_quote is her literal words. If it came only from a photograph, use "" and set source_photo.
- Photographs: propose only what is plainly visible and plainly intended as work — an empty wall she photographed under "fixed to the walls" is a proposal; her handbag on the floor is not.
- Counters she filled in are exact. "Switch points: 6" in Bedroom 1 is quantity 6, confidence high.
- Do not invent standard scope. A property does not get painting, curtains or a false ceiling because most do. If she did not ask, it is not here.
- confidence: high when she stated it, medium when it is a fair reading, low when you are inferring from a picture or an ambiguous phrase.
- Return an empty list if she wrote nothing usable. An empty list is a correct answer.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const KEY = Deno.env.get("ANTHROPIC_API_KEY");

  // Staff only, and checked against Supabase rather than trusted, so this is not
  // an open relay to a paid API.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Sign in first" }, 401);
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

  let briefId = "";
  try { briefId = ((await req.json())?.brief_id ?? "").toString(); } catch { /* ignore */ }
  if (!briefId) return json({ ok: false, error: "No brief given" }, 400);

  // ── read, as the caller ───────────────────────────────────────────────────
  const rest = (path: string) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { Authorization: auth, apikey: ANON } });

  const [bRes, tRes] = await Promise.all([
    rest(`designer_brief?id=eq.${encodeURIComponent(briefId)}&select=*`),
    rest(`task_catalogue?active=eq.true&select=id,name,trade,category,unit,aliases&order=trade,category,name`),
  ]);
  if (!bRes.ok) return json({ ok: false, error: `Could not read the brief (${bRes.status})` }, 200);
  const brief = (await bRes.json())?.[0];
  if (!brief) return json({ ok: false, error: "That brief no longer exists" }, 200);
  const tasks: Array<Record<string, unknown>> = tRes.ok ? await tRes.json() : [];
  if (!tasks.length) {
    return json({ ok: false, error: "The task catalogue is empty — add tasks in /admin/tasks first." }, 200);
  }

  const areas: string[] = Array.isArray(brief.areas) ? brief.areas : [];
  const answers: Record<string, Record<string, unknown>> = brief.answers ?? {};

  // ── build the message: her areas in order, each followed by its photos ─────
  // Text and pictures stay interleaved rather than being sent as a block of
  // prose and then a pile of images, because "which room is this a photo of" is
  // the whole question and the ordering is the answer.
  type Block = Record<string, unknown>;
  const content: Block[] = [];
  const photosRead: string[] = [];
  let photoBudget = MAX_PHOTOS;

  const catalogueText = tasks.map((t) => {
    const al = Array.isArray(t.aliases) && t.aliases.length ? ` (also: ${(t.aliases as string[]).join(", ")})` : "";
    return `${t.id} · ${t.name}${al} — ${t.trade} / ${t.category}, per ${t.unit}`;
  }).join("\n");

  content.push({
    type: "text",
    text:
      `Property ${brief.pid}${brief.layout ? ` · ${brief.layout}` : ""}.\n` +
      `Designer: ${brief.designer_name || "not given"}.\n\n` +
      `Areas (copy one of these exactly into every proposal's "area"):\n${areas.map((a) => `- ${a}`).join("\n")}\n\n` +
      `Task catalogue — id · name — trade / category:\n${catalogueText}\n\n` +
      `Her brief follows, area by area.`,
  });

  const LABEL: Record<string, string> = {
    furniture: "Furniture going in", light_points: "Light points to add or change",
    switch_points: "Extra switch points / sockets", wall_items: "Fixed to the walls",
    complications: "Anything complicated", windows: "Windows needing curtains",
    ceiling: "False ceiling / partitions / panelling", painting: "Painting beyond the usual",
  };

  for (const area of areas) {
    const a = answers[area] || {};
    const written = Object.entries(a)
      .filter(([k, v]) => k !== "photos" && (typeof v === "number" ? v > 0 : String(v ?? "").trim() !== ""))
      .map(([k, v]) => `  ${LABEL[k] || k}: ${v}`);
    const photos: string[] = Array.isArray(a.photos) ? (a.photos as string[]) : [];
    if (!written.length && !photos.length) continue;   // a blank room is not worth a token

    content.push({ type: "text", text: `\n### ${area}\n${written.join("\n") || "  (no text, photos only)"}` });

    for (const p of photos) {
      if (photoBudget <= 0) break;
      const ext = (p.split(".").pop() || "").toLowerCase();
      const media_type = MEDIA[ext];
      if (!media_type) continue;
      try {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/public/inspection-media/${p.split("/").map(encodeURIComponent).join("/")}`);
        if (!r.ok) continue;
        const buf = new Uint8Array(await r.arrayBuffer());
        if (!buf.length || buf.length > MAX_PHOTO_BYTES) continue;
        // Chunked, because String.fromCharCode(...buf) on a 4 MB array blows the
        // argument limit and throws a RangeError that reads like nothing.
        let bin = "";
        for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
        content.push({ type: "text", text: `photo path: ${p}` });
        content.push({ type: "image", source: { type: "base64", media_type, data: btoa(bin) } });
        photosRead.push(p);
        photoBudget--;
      } catch { /* a photo that will not load is not worth failing the run over */ }
    }
  }

  if (content.length <= 1) {
    return json({ ok: true, proposals: [], photos_read: [], empty: true });
  }

  // ── ask ───────────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: KEY });
  let parsed: z.infer<typeof Extraction> | null = null;
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(Extraction, "extraction") },
      messages: [{ role: "user", content: content as never }],
    });
    if (response.stop_reason === "refusal") {
      return json({ ok: false, error: "The request was declined. Nothing has been changed." }, 200);
    }
    parsed = response.parsed_output ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: `Reading the brief failed — ${msg}` }, 200);
  }
  if (!parsed) return json({ ok: false, error: "Nothing readable came back. Try again." }, 200);

  // ── sanity, ours not theirs ───────────────────────────────────────────────
  // Two things are checked here rather than trusted: that a catalogue_id is one
  // we sent, and that an area is one that exists. Both are cheap, and both are
  // the difference between a bad proposal and a bad row.
  const known = new Set(tasks.map((t) => String(t.id)));
  const areaSet = new Set(areas);
  const byId = new Map(tasks.map((t) => [String(t.id), t]));

  const proposals = (parsed.proposals || []).map((p) => {
    const id = known.has(p.catalogue_id) ? p.catalogue_id : "";
    const t = id ? byId.get(id) : null;
    return {
      catalogue_id: id,
      task_name: t ? String(t.name) : "",
      trade: t ? String(t.trade) : "",
      category: t ? String(t.category) : "",
      unit: t ? String(t.unit) : "",
      label: String(p.label || "").slice(0, 300),
      quantity: Math.max(1, Math.round(Number(p.quantity) || 1)),
      area: areaSet.has(p.area) ? p.area : "Whole property",
      confidence: p.confidence,
      source_quote: String(p.source_quote || "").slice(0, 500),
      source_photo: photosRead.includes(p.source_photo) ? p.source_photo : "",
    };
  });

  return json({ ok: true, proposals, photos_read: photosRead, by: user.email });
});
