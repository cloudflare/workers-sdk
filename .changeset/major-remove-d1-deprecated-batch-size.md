---
"wrangler": major
---

Remove `--batch-size` as an option for `wrangler d1 execute` and `wrangler d1 migrations apply`

This change removes the deprecated `--batch-size` flag, as it is no longer necessary to decrease the number of queries wrangler sends to D1.

Closes #7470
