# Local-dev observability (experimental)

> Experimental, **off by default**. This fork branch (`tail-observability-experiment`)
> adds local trace/log capture to `wrangler dev` and the Cloudflare Vite plugin,
> viewable in the Local Explorer.

When enabled, your Worker's requests are automatically captured as structured
**traces** (spans + logs) and shown in a new **Observability** tab in the Local
Explorer — no extra config, no external account. There's also an **MCP** tab to
let a coding agent read your local traces/logs.

## Quick start

```bash
git clone -b tail-observability-experiment https://github.com/nickhilpat/workers-sdk.git
cd workers-sdk
./setup.sh          # pnpm install + builds wrangler, miniflare, the UI, and the vite plugin
```

(Requires Node.js >= 20 and pnpm. First build takes a few minutes.)

## Run it — `wrangler dev`

From any Worker project, run this fork's wrangler with the flag:

```bash
cd /path/to/your-worker
node /path/to/workers-sdk/packages/wrangler/bin/wrangler.js dev --experimental-observability
```

Open the Local Explorer → **Observability**:

```
http://localhost:8787/cdn-cgi/explorer/
```

Optional alias:

```bash
alias wrx='node /path/to/workers-sdk/packages/wrangler/bin/wrangler.js'
wrx dev --experimental-observability
```

## Run it — Vite

Vite resolves `@cloudflare/vite-plugin` from your project's `node_modules`, so
symlink this build in, then opt in via the env var (there's no CLI flag for Vite):

```bash
cd /path/to/your-vite-app/node_modules
rm -rf @cloudflare/vite-plugin miniflare wrangler
ln -s /path/to/workers-sdk/packages/vite-plugin-cloudflare @cloudflare/vite-plugin
ln -s /path/to/workers-sdk/packages/miniflare miniflare
ln -s /path/to/workers-sdk/packages/wrangler wrangler

cd /path/to/your-vite-app
X_LOCAL_OBSERVABILITY=true vite dev
# → http://localhost:5173/cdn-cgi/explorer/  → Observability
```

`npm install` later restores the original packages.

> Note: `--experimental-observability` and `X_LOCAL_OBSERVABILITY=true` drive the
> same gate — the flag is just the user-facing opt-in for `wrangler dev`.

## What you get

- **Observability tab** — a trace list and a dashboard-style **waterfall**
  (Traces / Logs views), with search/filtering and a **Clear** action.
- **Multi-worker / distributed traces** — invocations that share a `traceId`
  (service bindings, Durable Objects, Vite auxiliary workers) stitch into a
  single trace. Worker/invocation hand-offs are marked in the waterfall, with a
  toggle to hide Vite dev module-runner plumbing spans.
- **MCP tab** — connect an agent (opencode / Claude Code / Cursor) to read your
  local traces and logs via a bundled MCP server, gated by an access config
  (which log levels / data bindings the agent may see), with an agent activity
  log and one-click install buttons that write project-local agent config files.

## How it works

- `miniflare` injects an internal streaming-tail collector that persists
  traces/spans/logs to an internal local D1 store (capture parity with the
  production streaming-tail-worker ingestion).
- `wrangler` (dev) and `@cloudflare/vite-plugin` wire the collector + store onto
  your Worker(s) when the flag / env var is set.
- `@cloudflare/local-explorer-ui` renders the Observability + MCP tabs (bundled
  into miniflare and served at `/cdn-cgi/explorer/`).

## Notes

- Fully gated and off by default — zero impact unless you pass the flag / env var.
- Local-dev only; no production code paths are affected.
- This is a work-in-progress experiment (tracking PR: cloudflare/workers-sdk#14391).
