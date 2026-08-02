// Sends a 6-digit attendance OTP to an approved vendor's email via Resend.
// Vendors stay anonymous — this is a custom OTP flow (NOT Supabase Auth), so a
// vendor never receives the `authenticated` role.
//
// Required secrets (Supabase → Project Settings → Edge Functions):
//   RESEND_API_KEY   — from resend.com
//   ATTEND_OTP_FROM  — optional, e.g. "Flent Attendance <attendance@flent.in>"
//                      (the domain must be verified in Resend)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("ATTEND_OTP_FROM") ?? "Flent Attendance <attendance@flent.in>";

  let email = "";
  try { email = ((await req.json())?.email ?? "").toString(); } catch { /* ignore */ }
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "Enter a valid email address." });
  }
  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "Email sending isn't configured yet (missing RESEND_API_KEY)." });
  }

  // cryptographically-random 6-digit code
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = String(100000 + (buf[0] % 900000));

  // store the hashed code — the RPC also verifies the vendor + throttles
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/attend_create_otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ p_email: email, p_code: code }),
  });
  if (!rpc.ok) {
    let msg = "Could not start verification.";
    try { msg = (await rpc.json())?.message ?? msg; } catch { /* ignore */ }
    return json({ ok: false, error: msg });
  }

  // deliver the code
  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: `${code} is your Flent attendance code`,
      text: `Your Flent attendance code is ${code}. It expires in 10 minutes.`,
      html: `<div style="font-family:sans-serif;font-size:15px;color:#16171f">Your Flent attendance code is<div style="font-size:30px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</div>It expires in 10 minutes. If you didn't request this, ignore it.</div>`,
    }),
  });
  if (!send.ok) {
    let detail = "";
    try { detail = JSON.stringify(await send.json()); } catch { /* ignore */ }
    return json({ ok: false, error: "Could not send the email — check the Resend key and that the sending domain is verified.", detail });
  }

  return json({ ok: true });
});
