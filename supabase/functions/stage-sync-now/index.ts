// "Sync now" on the calendar: runs the Stage → Pulse sync straight away instead
// of waiting for the next half-hour.
//
// The sync itself is the GitHub Actions workflow (.github/workflows/stage-sync.yml,
// scripts/stage-sync.py) — this only asks GitHub to run it now, the same as
// pressing "Run workflow" there. The token that can do that is a secret and
// never reaches the browser.
//
// Required secret (Supabase → Project Settings → Edge Functions):
//   GITHUB_SYNC_TOKEN — a fine-grained GitHub token for mohosin-cz/FlentFix with
//                       "Actions: Read and write" (nothing else).
// Optional: GITHUB_SYNC_REPO (default mohosin-cz/FlentFix), GITHUB_SYNC_REF (default main).
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
  const TOKEN = Deno.env.get("GITHUB_SYNC_TOKEN");
  const REPO = Deno.env.get("GITHUB_SYNC_REPO") ?? "mohosin-cz/FlentFix";
  const REF = Deno.env.get("GITHUB_SYNC_REF") ?? "main";

  // Staff only: the caller's session is checked with Supabase, not trusted.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Sign in first" }, 401);
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON } });
  if (!who.ok) return json({ ok: false, error: "Sign in first" }, 401);
  const user = await who.json();
  if (!String(user?.email ?? "").toLowerCase().endsWith("@flent.in")) return json({ ok: false, error: "Staff only" }, 403);

  if (!TOKEN) {
    return json({ ok: false, error: "Sync now isn’t set up yet: add the GITHUB_SYNC_TOKEN secret to the Supabase edge functions." }, 503);
  }

  const gh = (path: string, init: RequestInit = {}) => fetch(`https://api.github.com/repos/${REPO}/actions/workflows/stage-sync.yml${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "pulse-stage-sync-now", ...(init.headers ?? {}) },
  });

  // One at a time: if a run is already going, say so instead of queueing another.
  const running = await gh("/runs?per_page=5");
  if (running.ok) {
    const { workflow_runs = [] } = await running.json();
    const busy = workflow_runs.find((r: { status: string }) => r.status === "queued" || r.status === "in_progress");
    if (busy) return json({ ok: true, already: true, started_at: busy.created_at });
  }

  const res = await gh("/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: REF }) });
  if (res.status !== 204) {
    const detail = await res.text().catch(() => "");
    // Say what's wrong with the token without ever showing it: its length,
    // the public prefix GitHub gives every token, and stray characters.
    const t = TOKEN;
    const shape = `${t.length} characters, starts “${t.slice(0, t.startsWith("github_pat_") ? 11 : 4)}…”` +
      (/\s/.test(t) ? ", has spaces or line breaks" : "") + (/[<>"']/.test(t) ? ", has < > or quotes" : "");
    const hint = res.status === 401 ? `GitHub rejected the token (bad credentials) — the saved token is ${shape}. A real fine-grained token is about 93 characters and starts “github_pat_”.`
      : res.status === 403 ? "The token can’t run workflows — give it Actions: Read and write."
      : res.status === 404 ? "The token can’t see the FlentFix repository — give it access to mohosin-cz/FlentFix."
      : `GitHub didn’t start the sync (${res.status}).`;
    return json({ ok: false, error: hint, detail: detail.slice(0, 200) }, 502);
  }
  return json({ ok: true, requested_by: user.email, requested_at: new Date().toISOString() });
});
