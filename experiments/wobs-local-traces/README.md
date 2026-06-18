# Workers local-dev trace waterfall (prototype)

A bare-bones prototype that renders a **structured trace waterfall in the terminal** for a Worker running under `wrangler dev` — no deploy, no dashboard. It proves you can surface the same span data the production Observability dashboard shows, locally, in your inner loop.

> Prototype / spike. Built entirely on public primitives (`wrangler`, `miniflare`, the `tailStream` streaming-tail API, compat flag `streaming_tail_worker`). Private repo, shared internally.

## How it works

```
wobs-trace-demo (producer)
   │  workerd auto-instruments it (observability.traces on) and streams events:
   │     onset → spanOpen/spanClose (KV, D1, fetch) → log → return → outcome
   ▼  via "streaming_tail_consumers"
trace-collector (a tailStream WorkerEntrypoint)
   │  receives events live, buffers spans by trace, builds the tree, captures
   │  span attributes (D1 query text, fetch URL, rows read) + HTTP status
   ├─▶ prints a colored gantt waterfall to the wrangler dev terminal
   └─▶ persists the trace + spans to a local D1 (binding TRACES) so it survives
       across requests/sessions and can be queried after the fact
```

- **`wobs-trace-demo/`** — a demo Worker (KV + D1) with routes that exercise different trace shapes.
- **`trace-collector/`** — the streaming-tail consumer that renders the waterfall (`src/index.js`). Set `DEBUG = true` at the top to dump raw events.
- **`wobs-trace-demo/wrangler.trace.jsonc`** — dev-only config: tracing on + the streaming-tail flags + the consumer wired to `trace-collector`. (Don't deploy with this one.)

## Run it

```bash
cd wobs-trace-demo
npm install

# state dir shared by dev + the trace store + queries (pin it so all three agree)
STATE="$PWD/.wrangler/state"

# seed the demo DB (one time)
npx wrangler d1 execute wobs-demo-db --local --persist-to "$STATE" --file=./schema.sql
npx wrangler d1 execute wobs-demo-db --local --persist-to "$STATE" --file=./seed.sql

# create the trace store schema (one time)
npx wrangler d1 execute wobs-traces-db --local --persist-to "$STATE" \
  -c ../trace-collector/wrangler.jsonc --file=../trace-collector/schema.sql

# run producer + collector together
npx wrangler dev -c wrangler.trace.jsonc -c ../trace-collector/wrangler.jsonc --persist-to "$STATE"
```

> **Why `--persist-to`:** with multiple `-c` configs, a bare `wrangler d1 execute -c <other>` resolves its `.wrangler/state` relative to *that config's* directory, not your cwd — so the seed and the dev session can end up writing to two different SQLite files. Pinning one explicit `--persist-to` for dev, the seed, and queries keeps them on one store. (The real product, running the collector inside `wrangler dev`, owns a single state dir and avoids this entirely.)

Note the port it prints (`Ready on http://localhost:PORT`). In a second terminal:

```bash
curl localhost:PORT/fast
curl -X POST localhost:PORT/slow
curl localhost:PORT/chain
curl localhost:PORT/boom
curl localhost:PORT/checkout
```

The waterfall prints in the dev terminal after each request.

## Querying persisted traces

Every trace is written to a local D1 store, so you can inspect past requests/sessions after the fact (the local equivalent of prod's 7-day retention). Use the helper:

```bash
node trace-collector/trace-query.mjs list                 # recent traces (name, duration, outcome, status, span count)
node trace-collector/trace-query.mjs show <traceIdPrefix>  # full span tree for a trace, with attributes
node trace-collector/trace-query.mjs slow                  # slowest spans across all traces
node trace-collector/trace-query.mjs sql "SELECT ..."      # raw SQL against the trace store
```

The store has two tables — `traces` (one row per invocation) and `spans` (one row per span, with a JSON `attributes` column holding D1 query text, fetch URL, rows read, etc.). Example: find the N+1 in `/slow`:

```bash
node trace-collector/trace-query.mjs sql \
  "SELECT kind, name, COUNT(*) n, ROUND(SUM(duration_ms),1) total_ms
   FROM spans GROUP BY kind, name ORDER BY total_ms DESC;"
```

## What each route shows
- **`GET /fast`** — one KV read (`kv_get`). The healthy baseline.
- **`POST /slow`** — the N+1: 1 `d1_all` + 10 `d1_first` (each with D1's internal `fetch`). The bug is obvious in the waterfall.
- **`GET /chain`** — an outbound `fetch` span. (Fails locally — can't reach example.com — but works in prod.)
- **`GET /boom`** — throws, caught → 500 (handled error).
- **`GET /checkout`** — KV + D1 succeed, then throws uncaught → 500.

## Done
- **Persistence** — traces + spans written to a local D1 (`trace-collector/schema.sql`) on each `outcome`; survive across requests/sessions.
- **Queryability** — `trace-query.mjs` (list / show / slow / raw sql) over the persisted store.
- **Span attributes** — captured now (D1 query text, operation, rows read; fetch URL/method/status), stored as JSON on each span and visible via `show`.
- **HTTP status** — captured from the `return` event (`FetchResponseInfo.statusCode`) and shown in the waterfall header + `traces.status_code`.

## Known gaps / next steps
- **Errors don't always flag red locally** — uncaught exceptions get caught by wrangler's dev middleware, so `outcome` shows `ok` locally where prod would show `exception` (status_code still records the 500). Need to reconcile this local-vs-prod divergence.
- **Local vs prod**: outbound `fetch` can fail locally (`/chain` can't reach example.com).
- **Machine output**: add a `--format json` mode emitting the structured trace (align the schema with the dashboard / `transformTelemetryEvent`) for agents.
- **Productionize**: move the consumer *inside* `wrangler dev` so users don't author a tail worker, wire compat flags automatically, and own a single state dir (removes the `--persist-to` juggling above).
- **Cross-worker traces**: validate trace propagation across service bindings.
