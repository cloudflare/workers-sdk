# Branch: `tail-observability-experiment` — Local-dev Workers Observability

> Experiment branch. Brings Workers Observability into the local inner loop:
> structured traces, persisted locally, viewable in the local dev explorer —
> no deploy, no dashboard.

## Why this exists

Workers has structured traces, persisted logs, a query builder, and OTLP export
— but **none of it is in the local inner loop**. `wrangler dev` only shows
`console.log`; there's no span timing, no persistence, no way to query what
happened in a previous request. This branch proves you can surface the same
span data the production Observability dashboard shows, **locally**.

It maps to the spec's local track (problems #1 structured traces in dev, #2
local persistence). The separate `wrangler tail`-on-the-backend work (problem
#3) is **not** in this branch — it's a different, remote-only effort gated on a
backend auth question.

## What's in this branch

Two halves, both committed here:

### 1. The Observability (Traces) tab — `packages/local-explorer-ui/`
A new top-level tab in the local dev explorer that renders a trace waterfall,
modeled on the dashboard's Traces page.
- `src/lib/traces.ts` — reads the local trace store (D1 `traces`/`spans`
  tables) via the explorer's existing D1 raw-query endpoint; discovers the
  trace DB from worker bindings; builds the span tree from `parent_id`.
- `src/components/observability/TraceWaterfall.tsx` — two-column waterfall
  (span-name tree + timeline), gridlines, time axis, state-colored bars, kind
  dots, span-attributes detail panel.
- `src/routes/observability.tsx` — trace list (duration gauge + status badges)
  → click to expand the waterfall.
- `src/components/Sidebar.tsx` — top-level **Observability** entry.

### 2. The prototype that feeds it — `experiments/wobs-local-traces/`
A self-contained demo Worker + a `tailStream` collector (not a workspace
member, so it doesn't couple into the monorepo build).
- `wobs-trace-demo/` — demo Worker (KV + D1 + fetch) with routes that exercise
  different trace shapes (`/fast`, `/slow` N+1, `/chain`, `/boom`, `/checkout`).
- `trace-collector/` — a `tailStream` WorkerEntrypoint that captures spans,
  prints a terminal waterfall, **and persists each trace to a local D1**
  (`schema.sql`), plus `trace-query.mjs` (list / show / slow / sql).
- `RUNNING-IN-WORKERS-SDK.md` — exact setup + run commands.

## How it works

```
demo Worker  --(workerd auto-instruments, streaming_tail_worker +
                tail_worker_user_spans)-->  trace-collector (tailStream)
                                                  |
                                                  v  persists to
                                          local D1 (traces + spans, SQLite)
                                                  |
            local-explorer "Observability" tab  <-+  reads via the explorer's
                                                     existing D1 raw-query API
```

The **SQLite/D1 store is the interface** — the collector writes it, the tab
reads it through the explorer's existing D1 path. No new backend, no openapi
changes, no new binding type.

## How to run / demo

Build once from repo root:
```bash
pnpm -F @cloudflare/local-explorer-ui build && pnpm -F miniflare build && pnpm -F wrangler build
```
Then follow `experiments/wobs-local-traces/RUNNING-IN-WORKERS-SDK.md` to run the
demo+collector with the locally built wrangler and open `/cdn-cgi/explorer/` →
**Observability**.

## Status

### Done
- [x] Confirmed local workerd emits structured binding spans (KV/D1/fetch) via
      `streaming_tail_worker` + `tail_worker_user_spans` — local tracing is
      viable on public primitives.
- [x] Collector persists traces + spans to local D1; query helper.
- [x] Span attributes captured (D1 query text, rows read, fetch URL) + HTTP
      status (from the `return` event).
- [x] Observability tab: trace list + waterfall + span detail, reading the
      trace store via the explorer's D1 endpoint.
- [x] Builds + typechecks; data path verified end-to-end against a running
      explorer.

### To do
- [ ] **Make the tab match the Stratus traces page exactly** (visual parity —
      reuse the dashboard's components/layout).
- [ ] **`--format json` / machine-readable output** for agents; align the
      schema with the dashboard (`transformTelemetryEvent`).
- [ ] **Productionize capture**: fold the collector into `wrangler dev` so
      users don't author a tail worker, wire compat flags automatically, and
      own a single state dir (removes the `--persist-to` juggling).
- [ ] **Error fidelity**: uncaught exceptions are caught by wrangler's dev
      middleware, so `outcome` shows `ok` locally where prod shows `exception`.
- [ ] **Cross-worker traces**: validate trace propagation across service
      bindings locally.
- [ ] **Confirm compat-flag GA status** before enabling by default.
- [ ] **Upstream PR prep**: changeset + PR template; decide what actually ships
      (the `experiments/` prototype is scaffolding, not shippable).

## Out of scope here
- `wrangler tail` on the observability backend (problem #3) — separate branch;
  gated on how a CLI authenticates to the portal (Access JWT vs API token).
