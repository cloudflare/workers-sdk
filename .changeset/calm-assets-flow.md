---
"@cloudflare/workers-shared": patch
"miniflare": patch
---

Bypass the Asset Worker loopback on normal request and RPC paths

The inner asset entrypoint is now the default, avoiding the latency added by forwarding every call through `ctx.exports`. The outer loopback entrypoint and its cohort-routing infrastructure remain available as named exports in the Asset Worker and Miniflare bundles so the boundary can be re-enabled later.
