---
"wrangler": patch
---

feat: non-TTY check for required variables
Added a check in non-TTY environments for `account_id`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. If `account_id` exists in `wrangler.toml`
then `CLOUDFLARE_ACCOUNT_ID` is not needed in non-TTY scope. The `CLOUDFLARE_API_TOKEN` is necessary in non-TTY scope and will always error if missing.

resolves #827
