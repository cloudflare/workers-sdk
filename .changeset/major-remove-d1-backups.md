---
"wrangler": major
---

Remove `wrangler d1 backups`

BREAKING CHANGE: This change removes `wrangler d1 backups`, a set of alpha-only commands that would allow folks to interact with backups of their D1 alpha DBs.

For production D1 DBs, you can restore previous versions of your database with `wrangler d1 time-travel` and export it at any time with `wrangler d1 export`.

Closes #7470
