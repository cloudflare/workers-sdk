---
"wrangler": patch
---

Fix `wrangler types` generating runtime headers with trailing whitespace

Runtime type headers without compatibility flags now end at the compatibility date, keeping generated types reproducible when tools remove trailing whitespace.
