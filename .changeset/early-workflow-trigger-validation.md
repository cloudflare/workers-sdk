---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Validate external Workflow settings before updating Worker triggers

Reject `limits`, `concurrency`, `schedules`, `default_retention`, and `jurisdiction` configured on external Workflows before making trigger API calls. This prevents failed deployments from partially updating workers.dev or routes; dry runs reject the same invalid configurations.
