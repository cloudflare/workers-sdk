---
"wrangler": patch
---

experimental-feat: add an `insights` command to `wrangler d1`

This PR adds a `wrangler d1 insights <DB_NAME>` command, to let D1 users figure out which of their queries to D1 need to be optimised.

This command defaults to fetching the top 5 queries that took the longest to run in total over the last 24 hours.

You can also fetch the top 5 queries that consumed the most rows read over the last week, for example:

```bash
npx wrangler d1 insights northwind --sortBy reads --last 7
```

Or the top 5 queries that consumed the most rows written over the last month, for example:

```bash
npx wrangler d1 insights northwind --sortBy writes --last 31
```
