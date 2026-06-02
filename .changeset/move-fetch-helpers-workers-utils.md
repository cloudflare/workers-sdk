---
"@cloudflare/workers-utils": patch
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Move fetch helpers into `@cloudflare/workers-utils`

Shared Cloudflare API fetch helper types and plumbing now live in `@cloudflare/workers-utils` so Wrangler and other clients can use the same implementation.
