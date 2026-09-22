---
"@cloudflare/workers-utils": patch
"miniflare": patch
"wrangler": patch
---

Accept `workflow` entries in the `exports` configuration map

Configuration parsing, validation, and the Wrangler-to-Miniflare conversion now
understand workflow exports (`exports.<ClassName> = { type: "workflow", name, limits? }`)
and carry them through to Miniflare via a dedicated `workflowExports` option. This
is inert plumbing that lays the groundwork for exposing configured Workflows on
`ctx.exports`; the local runtime does not yet act on these entries.
