---
"wrangler": patch
---

Fix R2 Data Catalog snapshot-expiration API field names

The `wrangler r2 bucket catalog snapshot-expiration enable` command was sending incorrect field names
to the Cloudflare API, resulting in a 422 Unprocessable Entity error. This fix updates the API request
body to use the correct field names:

- `olderThanDays` -> `max_snapshot_age` (as duration string, e.g., "30d")
- `retainLast` -> `min_snapshots_to_keep`

The CLI options (`--older-than-days` and `--retain-last`) remain unchanged.
