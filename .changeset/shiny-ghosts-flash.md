---
"wrangler": patch
---

fix: stop getPlatformProxy crashing when internal DOs are present

Internal DOs still do not work with getPlatformProxy, but warn instead of crashing.
