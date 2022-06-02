---
"wrangler": patch
---

fix: warn on unexpected fields on migrations

This adds a warning for unexpected fields on `[migrations]` config, reported in https://github.com/cloudflare/wrangler2/issues/1165. It also adds a test for incorrect `renamed_classes` in a migration.
