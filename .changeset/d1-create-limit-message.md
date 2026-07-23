---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Improve the D1 database-limit error message

When creating a D1 database fails because the account has hit its database limit, the error now points to the relevant next steps — upgrading on the Workers Free plan or requesting a higher limit on a paid plan — alongside the existing commands to list and delete databases. Previously it only suggested deleting unused databases. This applies both to `wrangler d1 create` and to the D1 database that is created during resource provisioning on deploy.
