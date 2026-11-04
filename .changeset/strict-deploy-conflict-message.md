---
"@cloudflare/deploy-helpers": minor
---

Allow custom strict-mode conflict abort messages

Add an optional `strictModeAbortMessage` to deploy-helpers' pre-1.0 deploy and versions-upload APIs so callers can describe their own override flags when strict mode aborts a conflicting upload in a non-interactive session. Wrangler keeps its existing `--strict` guidance when the message is omitted.
