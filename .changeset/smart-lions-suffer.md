---
"wrangler": patch
---

feat: pull resource names for provisioning from config if provided

Uses `database_name` and `bucket_name` for provisioning if specified. For R2, this only happens if there is not a bucket with that name already. Also respects R2 `jurisdiction` if provided.
