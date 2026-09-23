---
"@cloudflare/deploy-helpers": patch
---

Fall back to per-zone route updates when a bulk route 403 omits its error code

`wrangler deploy` only retried route updates zone-by-zone when the API returned code 10000. The same missing All Zones rejection is sometimes returned as HTTP 403 with `code: null`, which aborted the deploy after the script had already uploaded. That response now uses the same fallback.
