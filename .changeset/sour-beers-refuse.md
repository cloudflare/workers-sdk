---
"wrangler": patch
---

refactor: clean up unnecessary async functions

The `readFile()` and `readConfig()` helpers do not need to be async.
Doing so just adds complexity to their call sites.
