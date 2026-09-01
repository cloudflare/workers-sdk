---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Move binding utilities into `@cloudflare/workers-utils`

Binding conversion, printing, and local-development validation are now exported from `@cloudflare/workers-utils` so they can be shared by Wrangler, the Cloudflare Vite plugin, and other consumers.

The corresponding exports have been removed from `@cloudflare/deploy-helpers`. Consumers should import them directly from `@cloudflare/workers-utils` instead.

Wrangler's `unstable_printBindings` API now accepts the bindings and an options object instead of five positional parameters.
