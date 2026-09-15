---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Restore static asset upload concurrency after gateway errors

Static asset uploads previously remained at concurrency one for the rest of the deployment after any 524 response, which could make large deployments exceed the upload session lifetime. Successful uploads now restore the session's original concurrency gradually while retaining gateway throttling. Requests that were already in flight when throttling began do not restore capacity, so a burst of stale successes cannot immediately undo backpressure.
