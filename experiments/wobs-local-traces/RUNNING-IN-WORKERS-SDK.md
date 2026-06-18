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

Fire some requests, then open the explorer and click **Observability**:

```bash
curl localhost:8799/fast
curl -X POST localhost:8799/slow
curl localhost:8799/boom
open http://localhost:8799/cdn-cgi/explorer/
```

See `README.md` for what each demo route exercises and how the collector works.
