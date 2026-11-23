---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Stop reporting Workers API error 10208 from `wrangler deploy` as a Workflow paid-plan error

The Workers API doesn't return Workflow provisioning errors from the upload, so a 10208 there is its own error (for example, a subrequest limit that is too high) and is now shown as is. `wrangler deploy` still explains the paid-plan error when it creates or updates a scheduled Workflow.
