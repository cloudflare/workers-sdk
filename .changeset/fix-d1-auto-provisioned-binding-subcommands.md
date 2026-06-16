---
"wrangler": patch
---

Resolve auto-provisioned D1 bindings via the API in remote subcommands

Remote D1 subcommands (`d1 execute --remote`, `d1 export --remote`, `d1 info`, `d1 insights`, `d1 delete`, `d1 migrations apply --remote`, `d1 migrations list --remote`, `d1 time-travel`) previously failed with:

> Found a database with name or binding DB but it is missing a database_id, which is needed for operations on remote resources.

when the `[[d1_databases]]` config entry only had `binding` and `database_name` (the shape `wrangler deploy` writes for automatically-provisioned bindings). They now resolve the real database UUID via `GET /accounts/:accountId/d1/database/:name?fields=uuid` and proceed as if `database_id` had been set in config.

If the config entry only has a `binding` (no `database_name`, no `database_id`), the lookup uses the same name `wrangler deploy` would create via auto provisioning (`<worker name>-<binding-lowercased-with-dashes>`).

Non-404 API failures (auth, rate-limit, server errors) now propagate verbatim instead of being masked as "database not found".
