---
"wrangler": major
---

Remove alpha support from `wrangler d1 migrations apply`

This change removes code that would take a backup of D1 alpha databases before proceeding with applying a migration.

We can remove this code as alpha DBs have not accepted queries in months.

Closes #7470
