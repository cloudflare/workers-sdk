---
"wrangler": patch
---

Enforce minimum 60 second interval for R2 Data Catalog sinks

R2 Data Catalog sinks now require a minimum `--roll-interval` of 60 seconds to prevent compaction issues in the R2 Data Catalog. This validation is applied when creating sinks via `wrangler pipelines sinks create` with type `r2-data-catalog`, and during the interactive `wrangler pipelines setup` flow.

Regular R2 sinks are not affected and can still use intervals as low as 10 seconds.
