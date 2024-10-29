---
"wrangler": patch
---

fix: remove deprecation warnings for `wrangler init`

We will not be removing `wrangler init` (it just delegates to create-cloudflare now). These warnings were causing confusion for users as it `wrangler init` is still recommended in many places.
