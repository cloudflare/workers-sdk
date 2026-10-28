---
"wrangler": minor
---

Allow the experimental `wrangler d1 insights` command to run across every D1 database in the account

The database name is now optional. With no name, the command returns the top queries across every D1 database in the account, and each result gains a `databaseId` field.
