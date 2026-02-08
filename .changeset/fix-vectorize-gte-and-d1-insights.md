---
"wrangler": patch
---

fix: Fix vectorize `$gte` operator typo and d1 insights output

- Fixed missing `$` prefix on `gte` operator in vectorize query filter validation, which caused `$gte` filter queries to be incorrectly rejected
- Fixed d1 insights command outputting JSON in both `--json` and non-JSON modes by using `logger.table()` for human-readable output
