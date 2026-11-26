---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Name `CLOUDFLARE_COMPLIANCE_REGION` in the FedRAMP High OAuth login error

When OAuth login was refused because the environment set the FedRAMP High compliance region, the error told you to remove the `CLOUDFLARE_API_ENVIRONMENT` environment variable, which doesn't set the region. It now names `CLOUDFLARE_COMPLIANCE_REGION`.
