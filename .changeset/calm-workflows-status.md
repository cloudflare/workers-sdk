---
"miniflare": patch
"wrangler": patch
---

Align Local Explorer Workflow instance status requests with production

Local Explorer and Wrangler local mode now use the production-compatible `status` request field for pausing, resuming, restarting, and terminating Workflow instances. Direct Local Explorer API consumers must replace the previous `action` field with `status`.

Successful Local Explorer status updates now return the production-compatible instance `status` and response `timestamp` instead of the local-only `result.success` acknowledgement.
