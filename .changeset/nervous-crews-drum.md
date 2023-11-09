---
"wrangler": patch
---

fix: perform old-asset-ttl in parallel

Expires old assets using Promise.all
Fixes #4414
