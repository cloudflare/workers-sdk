---
"wrangler": patch
---

Require explicit Terms of Service acceptance for `--temporary`

Wrangler now requires users to accept Cloudflare's Terms of Service and Privacy Policy before continuing with `--temporary`. Interactive terminals prompt users to type `yes`, while non-interactive environments must set `WRANGLER_TEMPORARY_ACCEPT_TERMS=yes`. The prompt links to both policies, explains that anything deployed with `--temporary` may expire unless it is claimed before expiry, and the flag uses a temporary preview account in interactive terminals instead of starting OAuth.
