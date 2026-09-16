---
"wrangler": patch
---

Allow Worker deployments to continue when granular API tokens cannot read the account's workers.dev subdomain

Wrangler now treats the account-level hostname lookup as optional while still applying the requested Worker-scoped subdomain configuration.
