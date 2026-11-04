---
"miniflare": minor
---

Let clients such as `@cloudflare/platform-proxy` use the bindings of a running runtime

A runtime now describes its Workers' bindings to these clients, which can then use them from Node.js. To attach from another process, start both processes with the same `MINIFLARE_PLATFORM_PROXY_SECRET`. Miniflare exports what the clients need: `PROXY_SECRET`, new `ProxyClient` options, and `ProxyClient#getBindings()` to build a Worker's `env` from the runtime's description. `ProxyNodeBinding` now takes plain override values instead of a proxy handler.
