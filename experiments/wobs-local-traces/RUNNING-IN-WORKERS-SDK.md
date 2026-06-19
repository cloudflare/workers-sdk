# Running this prototype inside workers-sdk

This is the local-dev tracing prototype (a demo Worker + a `tailStream`
collector that persists traces to a local D1). It's the **data producer** that
feeds the **Observability (Traces) tab** added to
`packages/local-explorer-ui` on this branch.

It is intentionally **not** a pnpm workspace member (it lives under
`experiments/`, which isn't in `pnpm-workspace.yaml`), so it won't couple into
the monorepo install/build. Run it standalone with the locally built wrangler.

## One-time setup

```bash
cd experiments/wobs-local-traces/wobs-trace-demo

# this prototype installs from public npm; if your global ~/.npmrc points
# @cloudflare at an internal registry, add a local override first:
printf 'registry=https://registry.npmjs.org/\n@cloudflare:registry=https://registry.npmjs.org/\n' > .npmrc
npm install

# shared local state dir for dev + the trace store + queries
STATE="$PWD/.wrangler/state"

# seed the demo DB + create the trace store schema
npx wrangler d1 execute wobs-demo-db --local --persist-to "$STATE" --file=./schema.sql
npx wrangler d1 execute wobs-demo-db --local --persist-to "$STATE" --file=./seed.sql
npx wrangler d1 execute wobs-traces-db --local --persist-to "$STATE" \
  -c ../trace-collector/wrangler.jsonc --file=../trace-collector/schema.sql
```

## Run it with the monorepo wrangler (so the new tab is available)

Build once from the repo root: `pnpm -F @cloudflare/local-explorer-ui build && pnpm -F miniflare build && pnpm -F wrangler build`

```bash
cd experiments/wobs-local-traces/wobs-trace-demo
STATE="$PWD/.wrangler/state"

node ../../../packages/wrangler/bin/wrangler.js dev \
  -c wrangler.trace.jsonc -c ../trace-collector/wrangler.jsonc \
  --persist-to "$STATE" --port 8799
```

Then open **two** pages:

- **Control panel (the buttons UI):** `http://localhost:8799/` — the demo
  Worker serves a click-to-fire page at its root. Click a button (or "Fire a
  burst") to generate traces without typing curl.
- **Local Explorer → Observability:** `http://localhost:8799/cdn-cgi/explorer/`
  — watch the traces/logs show up (switch views with the Traces/Logs dropdown).

```bash
open http://localhost:8799/                  # control panel (buttons)
open http://localhost:8799/cdn-cgi/explorer/ # observability UI

# ...or fire requests by hand:
curl localhost:8799/fast
curl -X POST localhost:8799/slow
curl localhost:8799/boom
```

### If you don't see any UI

- **Build the monorepo packages first** (the explorer is embedded in wrangler):
  from the repo root run `pnpm install && pnpm build`, or at minimum
  `pnpm -F @cloudflare/local-explorer-ui build && pnpm -F miniflare build && pnpm -F wrangler build`.
- **`npm install` inside `wobs-trace-demo`** (it's not a workspace member). On a
  Cloudflare machine your global `~/.npmrc` likely points `@cloudflare` at an
  internal registry — create the local `.npmrc` override shown in one-time setup
  first, or the install fetches the wrong packages.
- **Use the locally built wrangler** (`node ../../../packages/wrangler/bin/wrangler.js dev`),
  not a globally installed `wrangler` — only the source build has the
  Observability tab.
- The **control panel is at `/`**, the **explorer is at `/cdn-cgi/explorer/`** —
  on whatever port you passed to `--port` (8799 here; it falls back to another
  port if that's taken, so check the dev server's startup output).

See `README.md` for what each demo route exercises and how the collector works.
