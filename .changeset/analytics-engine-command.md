---
"wrangler": minor
---

Add `wrangler analytics-engine` command for querying Workers Analytics Engine

Query your Analytics Engine datasets directly from the CLI:

- `wrangler analytics-engine run "SELECT * FROM my_dataset LIMIT 10"`
- `wrangler analytics-engine run --file=query.sql`
- `wrangler ae run "SHOW TABLES" --format=json`

The `ae` alias is available for convenience. Output defaults to table format in interactive terminals and JSON when piped.
