---
"wrangler": patch
"@cloudflare/workers-shared": patch
"@cloudflare/deploy-helpers": patch
---

`wrangler deploy` now warns when a `_redirects` file exceeds the maximum number of dynamic rules and the remaining rules will be skipped, instead of silently dropping them — including any catch-all at the end of the file. This does not change what gets uploaded: the raw file is still uploaded as-is, and the asset worker remains the authoritative parser at runtime.
