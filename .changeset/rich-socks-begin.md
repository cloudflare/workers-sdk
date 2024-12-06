---
"wrangler": major
---

Remove alpha support from `wrangler d1 migrations apply`

BREAKING CHANGE: This change removes code that would take a backup of D1 alpha databases before proceeding with applying a migration.

We can remove this code as alpha DBs have not accepted queries in months.
