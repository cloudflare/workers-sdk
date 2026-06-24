---
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Add experimental local-dev observability trace capture (`X_LOCAL_OBSERVABILITY`)

When `X_LOCAL_OBSERVABILITY=true` is set, `wrangler dev` and the Cloudflare Vite
plugin automatically capture structured traces for whatever worker you're
developing — no extra config. Miniflare injects an internal trace collector as
a streaming-tail consumer of your worker(s), enables the required compatibility
flags, and persists each request's spans and logs to an internal D1 store that
the Local Explorer's Observability tab reads. This is experimental and off by
default; it can change without a major version bump.

The MCP server (which lets an agent inspect the local dev environment over MCP)
is now opt-in behind `X_LOCAL_OBSERVABILITY_MCP=true` and its Local Explorer tab
is hidden unless enabled — the `wrangler observability` CLI is the primary way to
inspect captured traces and logs, with MCP as an optional alternative.

When enabled, the Local Explorer also hosts a "codemode" MCP endpoint at
`/cdn-cgi/explorer/mcp`: rather than dumping the whole OpenAPI spec into an
agent's context, it exposes a `run` tool that executes a JS snippet against a
`cf` client (D1, KV, R2, Durable Objects, Workflows, and the trace store) and
returns only the data the agent asked for. The snippet runs in-process via the
worker's UnsafeEval capability, so it needs no separate install.
