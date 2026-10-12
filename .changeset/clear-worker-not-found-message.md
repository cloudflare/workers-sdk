---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Clarify the Worker not found error during CI deploy validation

Wrangler now reports that the configured Worker could not be found in the account instead of incorrectly describing the failure as a name mismatch.
