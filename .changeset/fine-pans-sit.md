---
"wrangler": minor
---

Add table-level compaction commands for R2 Data Catalog:

- `wrangler r2 bucket catalog compaction enable <bucket> [namespace] [table]`
- `wrangler r2 bucket catalog compaction disable <bucket> [namespace] [table]`

This allows you to enable and disable automatic file compaction for a specific R2 data catalog table.
