---
"@cloudflare/workers-shared": patch
"miniflare": patch
---

Enable loopback dispatch in the router worker via `ctx.exports`

This updates the router worker to dispatch requests through an inner entrypoint using `ctx.exports`, matching the loopback pattern used in related Workers services. It also enables `enable_ctx_exports` in both router-worker Wrangler config and Miniflare's assets router service so local development and tests follow the same loopback behavior as runtime.
