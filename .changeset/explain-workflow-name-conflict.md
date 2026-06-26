---
"wrangler": patch
---

Improve the deploy warning shown when a Workflow name already belongs to another Worker

The warning still notes that deploying reassigns the workflow to the current Worker, and now also explains why this happens (workflow names must be unique per account) and how to resolve it (rename the workflow in the Wrangler config).
