---
"wrangler": patch
---

fix: mark R2 object and bucket not found errors as unreportable

Previously, running `wrangler r2 objects {get,put}` with an object or bucket that didn't exist would ask if you wanted to report that error to Cloudflare. There's nothing we can do to fix this, so this change prevents the prompt in this case.
