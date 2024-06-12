---
"wrangler": patch
---

fix: reduce the number of parallel file reads on Windows to avoid EMFILE type errors

Fixes #1586
