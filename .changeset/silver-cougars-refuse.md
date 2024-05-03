---
"wrangler": patch
---

chore: log "Version ID" in `wrangler deploy`, `wrangler deployments list`, `wrangler deployments view` and `wrangler rollback` to support migration from the deprecated "Deployment ID". Users should update any parsing to use "Version ID" before "Deployment ID" is removed.
