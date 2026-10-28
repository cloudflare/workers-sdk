---
"wrangler": minor
---

Allow the experimental `wrangler d1 insights` command to run across every D1 database in the account

The database name is now optional. With no name, the command returns the top queries across every D1 database in the account, and each result gains `databaseId` and `databaseName` fields. `databaseName` is `null` for databases that have since been deleted.

The command now needs both the "Account Analytics: Read" and "D1: Read" permissions. Without a database name, it looks up the name of each database in the results through the D1 API.
