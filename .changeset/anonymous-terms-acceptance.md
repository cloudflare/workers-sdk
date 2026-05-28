---
"wrangler": patch
---

Require explicit Terms of Service acceptance for `--temporary`

Wrangler now prompts users to type `yes` before continuing with `--temporary`, including in non-interactive environments. The prompt links to Cloudflare's Terms of Service and Privacy Policy and explains that anything deployed with `--temporary` may expire unless it is claimed before expiry.
