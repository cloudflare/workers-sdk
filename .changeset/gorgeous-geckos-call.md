---
"wrangler": patch
---

Fix #7985.

This reverts the changes on #7945 that caused compatibility issues with Node 16 due to the introduction of `sharp`.
