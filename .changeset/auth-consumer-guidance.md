---
"@cloudflare/workers-auth": minor
---

Use each CLI's temporary-account flag in authentication errors

Default to `--temporary-account` while keeping Wrangler's `--temporary` spelling. Expose account-lookup authentication failure reasons so consumers can distinguish missing credentials from expired tokens without matching error messages.
