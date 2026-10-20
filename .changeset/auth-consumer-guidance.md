---
"@cloudflare/workers-auth": patch
---

Use each CLI's temporary-account flag in authentication errors

Keep Wrangler's `--temporary` spelling and use `--temporary-account` for cf. Expose account-lookup authentication failure reasons so consumers can distinguish missing credentials from expired tokens without matching error messages.
