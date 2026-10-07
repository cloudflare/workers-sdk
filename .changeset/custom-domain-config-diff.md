---
"@cloudflare/deploy-helpers": patch
---

Avoid false config drift warnings for unchanged custom domains

Compare custom-domain routes using their effective enabled and preview defaults, and ignore zone names inferred by Cloudflare when the local route does not specify a zone. Continue reporting explicit zone, flag, and route changes.
