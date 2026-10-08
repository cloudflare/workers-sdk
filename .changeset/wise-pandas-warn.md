---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Warn when `CLOUDFLARE_COMPLIANCE_REGION` overrides a conflicting configured compliance region

Wrangler now explains that the environment variable takes precedence and continues using its value instead of rejecting the command.
