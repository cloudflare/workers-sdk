---
"wrangler": minor
---

feat: add R2 Data Catalog snapshot expiration commands

Adds new commands to manage automatic snapshot expiration for R2 Data Catalog tables:

- `wrangler r2 bucket catalog snapshot-expiration enable` - Enable automatic snapshot expiration
- `wrangler r2 bucket catalog snapshot-expiration disable` - Disable automatic snapshot expiration

Snapshot expiration helps manage storage costs by automatically removing old table snapshots while keeping a minimum number of recent snapshots for recovery purposes.

Example usage:

```sh
# Enable snapshot expiration for entire catalog (keep 10 snapshots, expire after 5 days)
wrangler r2 bucket catalog snapshot-expiration enable my-bucket --token $R2_CATALOG_TOKEN --max-age 7200 --min-count 10

# Enable for specific table
wrangler r2 bucket catalog snapshot-expiration enable my-bucket my-namespace my-table --token $R2_CATALOG_TOKEN --max-age 2880 --min-count 5

# Disable snapshot expiration
wrangler r2 bucket catalog snapshot-expiration disable my-bucket
```
