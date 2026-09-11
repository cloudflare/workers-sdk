---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Clarify production status labels for custom domain routes

Wrangler now prefixes explicit custom domain production states with `production:` so they match Preview labels. The updated labels appear in deployed trigger output and `WRANGLER_OUTPUT_FILE_PATH`.
