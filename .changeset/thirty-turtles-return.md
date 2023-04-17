---
"wrangler": patch
---

fix: disable route validation when using `--experimental-local`

This ensures `wrangler dev --experimental-local` doesn't require a login or an internet connection if a `route` is configured.
