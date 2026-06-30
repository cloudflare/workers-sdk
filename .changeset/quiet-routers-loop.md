---
"@cloudflare/workers-shared": patch
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Bypass the router Worker loopback on the normal request path

The inner routing entrypoint is now the default, avoiding the latency added by forwarding every request through `ctx.exports`. The outer loopback entrypoint and its supporting infrastructure remain available as named exports in the router Worker, Miniflare, and Vite plugin bundles so the boundary can be re-enabled later.
