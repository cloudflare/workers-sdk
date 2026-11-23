---
"wrangler": patch
---

Exit with a nonzero status when the Basin SQL service rejects a query

`wrangler basin sql query` reports the service error and exits with status 1 so shell scripts and CI can detect a rejected query.
