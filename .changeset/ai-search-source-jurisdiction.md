---
"wrangler": minor
---

Add `--source-jurisdiction` to `wrangler ai-search create` for R2-backed instances

R2 buckets can live in a specific jurisdiction (for example `eu` or `fedramp`). You can now point an AI Search instance at a bucket in one of those jurisdictions:

`wrangler ai-search create my-instance --type r2 --source my-bucket --source-jurisdiction eu`

When run interactively, the R2 source flow also prompts for a jurisdiction and lists (and can create) buckets within it. The value is forwarded to the API as `source_params.r2_jurisdiction`; pass `default` for no specific jurisdiction. This AI Search command is in open beta.
