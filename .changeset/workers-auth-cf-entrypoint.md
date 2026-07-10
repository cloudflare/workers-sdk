---
"@cloudflare/workers-auth": minor
---

Add a product-agnostic auth core and a `@cloudflare/workers-auth/cf` entrypoint

The CLI-facing auth machinery is now product-agnostic and shared via an `AuthProduct` descriptor, with a new `/cf` entrypoint (`createCfAuth`) alongside the existing `/wrangler` one. Each product supplies its own OAuth app values, config paths, and scope catalog, and gets an isolated config-cache namespace so one CLI's login/logout never purges another's cache.
