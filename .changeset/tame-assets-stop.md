---
"wrangler": patch
---

Stop `getPlatformProxy()` asset misses from recursively calling its own listener

Requests for assets that do not exist now return a 404 response without hanging or exhausting local development resources.
