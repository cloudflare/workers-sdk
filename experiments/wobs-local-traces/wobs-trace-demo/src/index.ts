/**
 * wobs-trace-demo
 *
 * A deliberately-instrumented Worker that reproduces the observability gap the
 * "wobs local dev gets an upgrade" project is about.
 *
 * Every route does real binding work (KV, D1) and/or a subrequest fetch. With
 * `observability.tracing.enabled = true`, workerd auto-creates a span for each
 * of these operations. In PRODUCTION you can see that span tree (waterfall) in
 * the dashboard. In LOCAL `wrangler dev` you currently see ONLY the console.log
 * lines below -- no spans, no timing breakdown, no per-binding detail.
 *
 * Routes:
 *   GET  /fast   -> 1 KV read. The well-behaved request (~fast).
 *   POST /slow   -> N+1 trap: 1 D1 list query + one D1 query PER item (~10).
 *   GET  /chain  -> an outbound fetch() subrequest (shows a fetch span).
 *   GET  /boom   -> throws, to show error/exception handling.
 */

interface Env {
  CACHE: KVNamespace;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    console.log(`--> ${route}`);

    // NOTE: /checkout is intentionally OUTSIDE the try/catch so its error
    // propagates as an UNCAUGHT exception. That makes the trace's root-span
    // outcome = "exception" (vs /boom, which is caught and returns a clean 500
    // with outcome = "ok"). It does real KV + D1 work first, so the trace shows
    // successful spans followed by the failing one.
    if (url.pathname === "/checkout") {
      return await handleCheckout(env);
    }

    try {
      switch (url.pathname) {
        case "/fast":
          return await handleFast(env);
        case "/slow":
          return await handleSlow(env);
        case "/chain":
          return await handleChain();
        case "/boom":
          return await handleBoom();
        default:
          if (url.pathname === "/") {
            return new Response(homePage(), {
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }
          return new Response("Not found\n", { status: 404 });
      }
    } catch (err) {
      console.error(`!! ${route} failed:`, err instanceof Error ? err.message : err);
      return new Response("Internal Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * A tiny click-to-fire control panel served at `/`. Each button issues a fetch
 * to one of the demo routes so you can generate traces without typing curl —
 * then watch them appear in the local explorer's Observability tab.
 */
function homePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>wobs-trace-demo — control panel</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; max-width: 720px; }
  h1 { font-size: 1.15rem; margin: 0 0 .25rem; }
  p.sub { color: #888; margin: 0 0 1.5rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
  button { font: inherit; padding: .7rem .9rem; border-radius: 10px; border: 1px solid #8884; background: #f4920820; cursor: pointer; text-align: left; }
  button:hover { background: #f4920833; }
  button b { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  button small { color: #888; }
  .burst { grid-column: 1 / -1; background: #3992ff22; border-color: #3992ff55; }
  #log { margin-top: 1.5rem; border-top: 1px solid #8883; padding-top: .75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; max-height: 220px; overflow:auto; }
  .ok { color: #2a9d4a; } .err { color: #e0483d; }
  a { color: #3992ff; }
</style>
</head>
<body>
  <h1>🌊 wobs-trace-demo</h1>
  <p class="sub">Click a button to fire a request — each one produces a trace. Watch them in the
  <a href="/cdn-cgi/explorer/" target="_blank">Local Explorer → Observability</a> tab (and your terminal).</p>

  <div class="grid">
    <button data-m="GET"  data-p="/fast"><b>GET /fast</b><small>1 KV read — baseline</small></button>
    <button data-m="POST" data-p="/slow"><b>POST /slow</b><small>N+1: ~11 D1 queries</small></button>
    <button data-m="GET"  data-p="/chain"><b>GET /chain</b><small>outbound fetch()</small></button>
    <button data-m="GET"  data-p="/boom"><b>GET /boom</b><small>handled error → 500</small></button>
    <button data-m="GET"  data-p="/checkout"><b>GET /checkout</b><small>KV+D1, then throws</small></button>
    <button class="burst" id="burst"><b>⚡ Fire a burst (one of each ×3)</b><small>generate a batch of traces</small></button>
  </div>

  <div id="log"></div>

<script>
  const logEl = document.getElementById("log");
  function log(line, cls) {
    const t = new Date().toLocaleTimeString();
    logEl.innerHTML = '<span class="' + (cls||'') + '">' + t + '  ' + line + '</span>\\n' + logEl.innerHTML;
  }
  async function fire(method, path) {
    const start = performance.now();
    try {
      const res = await fetch(path, { method });
      const ms = Math.round(performance.now() - start);
      log(method + ' ' + path + ' → ' + res.status + ' (' + ms + 'ms)', res.ok ? 'ok' : 'err');
    } catch (e) {
      log(method + ' ' + path + ' → failed: ' + e.message, 'err');
    }
  }
  document.querySelectorAll('button[data-p]').forEach((b) =>
    b.addEventListener('click', () => fire(b.dataset.m, b.dataset.p))
  );
  document.getElementById('burst').addEventListener('click', async () => {
    const routes = [['GET','/fast'],['POST','/slow'],['GET','/chain'],['GET','/boom'],['GET','/checkout']];
    for (let i = 0; i < 3; i++) for (const [m, p] of routes) { await fire(m, p); }
  });
</script>
</body>
</html>`;
}

/** One KV read. Fast and boring -- the baseline "good" request. */
async function handleFast(env: Env): Promise<Response> {
  const cached = await env.CACHE.get("greeting");
  console.log(`/fast: kv greeting = ${cached ?? "(miss)"}`);
  if (!cached) {
    await env.CACHE.put("greeting", "hello from KV");
  }
  return Response.json({ ok: true, greeting: cached ?? "hello from KV" });
}

/**
 * The N+1 anti-pattern -- the heart of the demo.
 *
 * It first reads the list of menu items (1 query), then loops and runs a
 * SEPARATE D1 query for each item to count its votes (N queries). The flat log
 * will just say "/slow ok". The trace will reveal ~11 D1 spans stacked up,
 * which is exactly why it's slow. This is the bug today's CLI hides.
 */
async function handleSlow(env: Env): Promise<Response> {
  const { results: items } = await env.DB.prepare(
    "SELECT id, name FROM menu_items",
  ).all<{ id: number; name: string }>();
  console.log(`/slow: fetched ${items.length} menu items`);

  const tally: Array<{ name: string; votes: number }> = [];
  for (const item of items) {
    // BAD: one round-trip per item instead of a single GROUP BY.
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM votes WHERE menu_item_id = ?",
    )
      .bind(item.id)
      .first<{ c: number }>();
    tally.push({ name: item.name, votes: row?.c ?? 0 });
  }

  console.log(`/slow: tallied votes for ${tally.length} items`);
  tally.sort((a, b) => b.votes - a.votes);
  return Response.json({ ok: true, winner: tally[0], tally });
}

/** Outbound subrequest -- produces a fetch span in the trace. */
async function handleChain(): Promise<Response> {
  const res = await fetch("https://example.com/");
  console.log(`/chain: upstream status = ${res.status}`);
  const text = await res.text();
  return Response.json({ ok: true, upstreamStatus: res.status, bytes: text.length });
}

/** Deliberately throws -- shows up as an error span / exception. */
async function handleBoom(): Promise<Response> {
  console.log("/boom: about to throw");
  throw new Error("intentional boom for tracing demo");
}

/**
 * Realistic failure: does real work (KV read + D1 query) and THEN throws an
 * UNCAUGHT error -- simulating e.g. a payment step blowing up after the session
 * and cart loads succeeded. Because it is not wrapped in try/catch, the runtime
 * sees an uncaught exception: the root span's outcome is "exception" (not "ok"),
 * and the trace shows kv_get + d1_all succeeding before the failure point.
 */
async function handleCheckout(env: Env): Promise<Response> {
  const session = await env.CACHE.get("session"); // kv_get span (ok)
  console.log(`/checkout: session = ${session ?? "(none)"}`);

  const { results } = await env.DB.prepare(
    "SELECT id, name FROM menu_items",
  ).all<{ id: number; name: string }>(); // d1_all span (ok)
  console.log(`/checkout: loaded cart with ${results.length} items`);

  // The "payment" step fails -- uncaught, so it bubbles up to the runtime.
  throw new Error("payment provider timeout after 2 prior calls succeeded");
}
