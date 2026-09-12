---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": patch
"wrangler": minor
---

Support jurisdiction when automatically provisioning D1 databases

Set `jurisdiction` on a D1 binding without a `database_id` to create the database in that jurisdiction during deployment. For example, `{"d1_databases":[{"binding":"DB","jurisdiction":"eu"}]}` creates an EU-jurisdiction database.
