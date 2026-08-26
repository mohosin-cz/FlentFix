// Emails each vendor a link to their own monthly invoice to sign.
//
// The document is frozen server-side by invoice_prepare_send before the mail
// goes out, so what lands in the inbox and what gets signed are the same
// numbers. That RPC is service-role only, which is why this runs here and not
// from the browser.
//
// One invoice per payout line, one token per invoice. Never keyed on email:
// two approved vendors share an address, so an email-keyed link would show one
// of them the other's pay.
//
// Required secrets (Supabase → Project Settings → Edge Functions):
//   RESEND_API_KEY     — from resend.com
//   INVOICE_FROM       — optional, e.g. "Flent Payroll <payroll@flent.in>"
//                        (domain must be verified in Resend)
//   APP_BASE_URL       — optional, e.g. "https://pulse.flent.in"
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const money = (n: unknown) =>
  "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function emailHtml(name: string, invNo: string, month: string, net: unknown, link: string) {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;color:#16171f;line-height:1.6;max-width:520px">
  <p>Hello ${esc(name)},</p>
  <p>Your invoice for <b>${esc(month)}</b> is ready. Please review it and sign to confirm the amount is correct.</p>
  <table style="border-collapse:collapse;margin:18px 0;font-size:14px">
    <tr><td style="padding:4px 18px 4px 0;color:#6b6d82">Invoice</td><td style="font-weight:600">${esc(invNo)}</td></tr>
    <tr><td style="padding:4px 18px 4px 0;color:#6b6d82">Net payable</td><td style="font-weight:700;font-size:17px">${esc(money(net))}</td></tr>
  </table>
  <p><a href="${esc(link)}" style="display:inline-block;background:#c8963e;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">Review &amp; sign</a></p>
  <p style="color:#6b6d82;font-size:13px">If the amount looks wrong, don't sign — reply to this email and we'll correct it.</p>
  <p style="color:#6b6d82;font-size:12px">This link is personal to you. Please don't forward it.</p>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("INVOICE_FROM") ?? "Flent Payroll <payroll@flent.in>";
  const BASE = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");

  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "Email sending isn't configured yet (missing RESEND_API_KEY)." });
  }

  // Only staff may trigger a send. The caller's JWT is checked against Supabase
  // Auth — an anon key alone is not enough.
  const authz = req.headers.get("Authorization") ?? "";
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authz, apikey: SERVICE_ROLE },
  });
  if (!who.ok) return json({ ok: false, error: "Sign in again to send invoices." }, 401);

  let body: { invoice_ids?: string[]; origin?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const ids = Array.isArray(body.invoice_ids) ? body.invoice_ids.filter(Boolean) : [];
  if (!ids.length) return json({ ok: false, error: "Nothing to send." });
  if (ids.length > 200) return json({ ok: false, error: "Too many invoices in one go." });

  // Prefer the configured base; fall back to wherever the request came from so
  // this still works before APP_BASE_URL is set.
  const origin = BASE || (body.origin ?? "").replace(/\/$/, "") ||
    (req.headers.get("origin") ?? "").replace(/\/$/, "");
  if (!origin) return json({ ok: false, error: "Could not work out the site address for the link." });

  const svc = { "Content-Type": "application/json", apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };
  const sent: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    // 1. freeze + mark sent, and get the token back
    const prep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/invoice_prepare_send`, {
      method: "POST", headers: svc, body: JSON.stringify({ p_invoice_id: id }),
    });
    if (!prep.ok) {
      let msg = "Could not prepare this invoice.";
      try { msg = (await prep.json())?.message ?? msg; } catch { /* ignore */ }
      failed.push({ id, error: msg });
      continue;
    }
    const d = await prep.json();
    const month = new Date(d?.snapshot?.period_month ?? Date.now())
      .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const link = `${origin}/vi/${d.token}`;

    // 2. deliver
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [d.email],
        subject: `Invoice ${d.invoice_no} — ${month} — please sign`,
        text: `Hello ${d.name},\n\nYour invoice for ${month} is ready.\n` +
              `Invoice ${d.invoice_no}, net payable ${money(d.net_payable)}.\n\n` +
              `Review and sign: ${link}\n\n` +
              `If the amount looks wrong, don't sign — reply to this email instead.\n` +
              `This link is personal to you; please don't forward it.`,
        html: emailHtml(d.name, d.invoice_no, month, d.net_payable, link),
      }),
    });

    if (!send.ok) {
      let detail = "";
      try { detail = JSON.stringify(await send.json()); } catch { /* ignore */ }
      // The invoice is already frozen and marked sent; record why the mail
      // didn't land so staff can resend rather than silently believing it did.
      await fetch(`${SUPABASE_URL}/rest/v1/vendor_invoices?id=eq.${id}`, {
        method: "PATCH", headers: { ...svc, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "draft", sent_at: null, send_error: detail.slice(0, 500) }),
      });
      failed.push({ id, error: "Email did not send — check the Resend key and verified domain." });
      continue;
    }
    sent.push(id);
  }

  return json({ ok: failed.length === 0, sent: sent.length, failed });
});
