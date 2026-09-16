---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Add native support for the account-scoped Analytics SQL binding

Declare the zero-configuration binding in `wrangler.json` with `"analytics": { "binding": "ANALYTICS" }`. Wrangler uploads the `analytics` binding type and proxies it to the remote service during local development, so `wrangler dev` can call the binding without `unsafe.bindings`.
