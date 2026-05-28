---
"wrangler": patch
---

Require explicit Terms of Service acceptance for `--allow-anonymous`

Wrangler now prompts users to type `yes` before continuing with `--allow-anonymous`, including in non-interactive environments. The prompt links to Cloudflare's Terms of Service and Privacy Policy, and the flag now uses a temporary preview account in interactive terminals instead of starting OAuth.
