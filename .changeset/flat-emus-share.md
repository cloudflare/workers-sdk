---
"wrangler": patch
---

add a warning if service environments are being used.

Service environments are not ready for widespread usage, and their behaviour is going to change. This adds a warning if anyone uses them.

Closes https://github.com/cloudflare/wrangler2/issues/809
