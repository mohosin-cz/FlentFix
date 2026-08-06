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

  // SLACK_WEBHOOK_URL is the documented name, but the secret is easy to save
  // under the webhook's Slack display name instead ("Setup Ops Internal
  // Webhook"), which fails in a way that looks identical to not adding it at
  // all. So: prefer the canonical name, otherwise accept any secret whose VALUE
  // is literally a Slack webhook endpoint. Matching on the value, not a name
  // pattern, is what keeps that safe — nothing else can be picked up by it.
  const isSlackHook = (v: string) => /^https:\/\/hooks\.slack\.com\/services\//.test(v.trim());
  const env = Deno.env.toObject();
  const fallbackKey = Object.keys(env).find((k) => k !== "SLACK_WEBHOOK_URL" && isSlackHook(env[k] ?? ""));
  const canonical = Deno.env.get("SLACK_WEBHOOK_URL");
  const WEBHOOK = (canonical && isSlackHook(canonical) ? canonical : null) ?? (fallbackKey ? env[fallbackKey] : null);
  const usedKey = canonical && isSlackHook(canonical) ? "SLACK_WEBHOOK_URL" : fallbackKey;

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
    // A setup step rather than a bug, so say exactly what to do. Report the
    // NAMES of any Slack-ish secrets we can see — never the values — so a
    // mistyped URL is distinguishable from a missing one.
    const suspects = Object.keys(env).filter((k) => /slack|webhook|hook/i.test(k));
    return json({
      ok: false,
      error: suspects.length
        ? `${suspects.join(", ")} is set, but its value isn’t a Slack webhook URL — it should start with https://hooks.slack.com/services/`
        : "Slack isn’t connected yet — add SLACK_WEBHOOK_URL in Supabase → Edge Functions secrets, then click again.",
    }, 200);
  }

  let text = "";
  let pid = "";
  let blocks: unknown[] = [];
  try {
    const body = await req.json();
    text = (body?.text ?? "").toString();
    pid = (body?.pid ?? "").toString();
    if (Array.isArray(body?.blocks)) blocks = body.blocks;
  } catch { /* ignore */ }

  if (!text.trim()) return json({ ok: false, error: "Nothing to post" }, 400);

  // `text` is still sent alongside the blocks: it is what Slack shows in the
  // notification and in clients that cannot render Block Kit, so dropping it
  // would make the push notification read as blank.
  const attribution = `posted by ${user.email}${pid ? ` · PID ${pid}` : ""}`;
  const payload: Record<string, unknown> = { text };
  if (blocks.length) {
    // 50 is Slack's hard cap; the client already trims to fit, this is a guard.
    payload.blocks = [
      ...blocks.slice(0, 49),
      { type: "context", elements: [{ type: "mrkdwn", text: attribution }] },
    ];
  } else {
    payload.text = `${text}\n\n_${attribution}_`;
  }

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ ok: false, error: `Slack rejected it (${res.status}) ${detail}`.trim() }, 200);
  }

  // Say which secret was used (name only) so a fallback match is never silent.
  return json({ ok: true, via: usedKey });
});
