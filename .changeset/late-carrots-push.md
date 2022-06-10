---
"wrangler": patch
---

fix: warn on unexpected fields on `config.triggers`

This adds a warning when we find unexpected fields on the `triggers` config (and any future fields that use the `isObjectWith()` validation helper)
