---
"wrangler": patch
---

fix: rename `--count` to `--limit` in `wrangler d1 insights`

This PR renames `wrangler d1 insight`'s `--count` flag to `--limit` to improve clarity and conform to naming conventions.

To avoid a breaking change, we have kept `--count` as an alias to `--limit`.
