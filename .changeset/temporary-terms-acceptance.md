---
"wrangler": minor
---

Handle Terms of Service and Privacy Policy for `--temporary`

Wrangler now handles Cloudflare's Terms of Service and Privacy Policy before continuing with `--temporary`. Interactive terminals prompt users to type `yes`; non-interactive shells print a notice with both policy links and continue. Wrangler sends both policy URLs to the temporary account provisioning service.
