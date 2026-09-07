---
"wrangler": patch
---

Stop preparing container images after an abort

Aborting local container image preparation now stops later builds and pulls and skips the egress interceptor pull instead of continuing Docker work in the background.
