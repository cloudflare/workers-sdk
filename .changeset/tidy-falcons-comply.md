---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Use the FedRAMP High managed container registry when Wrangler targets the FedRAMP High compliance region

Container builds, pushes, deployments, image commands, and local development now select the corresponding production or staging FedRAMP registry and API from either `compliance_region` or `CLOUDFLARE_COMPLIANCE_REGION`.
