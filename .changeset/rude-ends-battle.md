---
"wrangler": patch
---

Fix `wrangler pipelines setup` failing for Data Catalog sinks on new buckets by using the correct R2 Catalog API error code (`40401`).
