---
"wrangler": patch
---

polish: validate payload for `kv:bulk put` on client side

This adds client side validation for the paylod for `kv:bulk put`, importantly ensuring we're uploading only string key/value pairs (as well as validation for the other fields).

Fixes https://github.com/cloudflare/wrangler2/issues/571
