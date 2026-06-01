---
"wrangler": patch
---

Require explicit Terms of Service acceptance for `--temporary`

Wrangler now requires users to accept Cloudflare's Terms of Service and Privacy Policy before continuing with `--temporary`. Interactive terminals prompt users to type `yes`; non-interactive shells fail with guidance to rerun in an interactive terminal so the user can review the policy links and accept the terms. The prompt links to both policies, Wrangler sends both policy URLs to the temporary account provisioning service, and the prompt explains that anything deployed with `--temporary` may expire unless it is claimed before expiry.
