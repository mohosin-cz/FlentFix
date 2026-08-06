// Posts a work order completion report summary to Slack.
//
// The webhook URL is a secret and never reaches the browser — the client sends
// the text, this function holds the destination.
//
// Required secret (Supabase → Project Settings → Edge Functions):
//   SLACK_WEBHOOK_URL — an Incoming Webhook from api.slack.com/apps
//                       (Incoming Webhooks → Add to Workspace → pick a channel)
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
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const WEBHOOK = Deno.env.get("SLACK_WEBHOOK_URL");

  // Staff only. The caller's JWT is checked against Supabase rather than trusted,
  // so this cannot be used as an open relay into the workspace channel.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Sign in to post to Slack" }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: ANON },
  });
  if (!who.ok) return json({ ok: false, error: "Sign in to post to Slack" }, 401);
  const user = await who.json();
  if (!user?.email) return json({ ok: false, error: "Sign in to post to Slack" }, 401);

  if (!WEBHOOK) {
    // By far the likeliest failure, and it is a setup step rather than a bug —
    // say exactly what to do instead of returning a bare 500.
    return json({
      ok: false,
      error: "Slack isn’t connected yet — add SLACK_WEBHOOK_URL in Supabase → Edge Functions secrets.",
    }, 200);
  }

  let text = "";
  let pid = "";
  try {
    const body = await req.json();
    text = (body?.text ?? "").toString();
    pid = (body?.pid ?? "").toString();
  } catch { /* ignore */ }

  if (!text.trim()) return json({ ok: false, error: "Nothing to post" }, 400);

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${text}\n\n_posted by ${user.email}${pid ? ` · PID ${pid}` : ""}_`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ ok: false, error: `Slack rejected it (${res.status}) ${detail}`.trim() }, 200);
  }

  return json({ ok: true });
});
