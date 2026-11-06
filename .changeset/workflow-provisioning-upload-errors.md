---
"@cloudflare/workers-utils": patch
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Show clearer errors when Workflow provisioning fails during a Worker upload

When the Workers API provisions Workflow exports during `wrangler deploy` and rejects a scheduled Workflow because the account is on the free plan, Wrangler now shows the same message as `wrangler triggers deploy`: `Workflow "<name>" has "schedules" configured, but scheduled Workflows require a paid Workers plan.` Wrangler also no longer retries an upload that failed with "Worker deployment committed, but Workflow provisioning failed", since the Worker is already deployed and retrying would upload it again.
