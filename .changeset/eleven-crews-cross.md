---
"wrangler": patch
---

Remove dependency on create-cloudflare.

Previously, `wrangler generate` was a thin wrapper around [`create-cloudflare`](https://github.com/cloudflare/templates/tree/main/packages/create-cloudflare). Now, we've moved over the logic from that package directly into `wrangler`.
