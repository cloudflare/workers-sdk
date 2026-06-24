---
"wrangler": minor
---

Add auto-provisioning for KV and R2 bindings in `wrangler preview`

Preview deployments now create deterministic KV namespaces and R2 buckets for binding-only entries in the `previews` config block, then use those generated resources for the deployment without writing IDs back to the config file. `wrangler preview delete` also cleans up only those auto-provisioned preview resources, leaving explicitly configured KV namespaces and R2 buckets untouched.
