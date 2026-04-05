---
"wrangler": patch
---

Fix `wrangler types --check` for multi-worker setups

Previously, `wrangler types --check` ignored secondary worker configs passed via multiple `-c` flags. The check would always report types as out of date because it compared against a hash generated without the secondary worker entries. The secondary config processing now runs before the staleness check, so the comparison includes cross-worker type information.
