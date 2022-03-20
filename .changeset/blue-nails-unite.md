---
"wrangler": patch
---

fix: use `expiration_ttl` to expire assets with `[site]`

This switches how we expire static assets with `[site]` uploads to use `expiration_ttl` instead of `expiration`. This is because we can't trust the time that a deploy target may provide (like in https://github.com/cloudflare/wrangler/issues/2224).
