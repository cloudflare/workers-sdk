---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Upload Workflow export settings with the Worker

`wrangler deploy` and `wrangler versions upload` now include the settings of each `workflow` export (`limits`, `concurrency`, `schedules`, `default_retention`, and `jurisdiction`) in the upload, instead of sending only its type and name. Uploads of a Worker with `workflow` exports also send a `Cloudflare-Workers-Script-Api-Date` header, which lets the Workers API provision Workflow exports from these settings as part of the upload. `wrangler deploy` and `wrangler triggers deploy` still create or update each Workflow through the Workflows API afterwards, as before.

If provisioning a scheduled Workflow fails because the account is on the free plan, `wrangler deploy` now explains that scheduled Workflows require a paid Workers plan.
