---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add `migrations_pattern` to D1 database bindings

The D1 binding now accepts an optional `migrations_pattern` field, allowing you to point `wrangler d1 migrations apply` and `wrangler d1 migrations list` at migration files in nested layouts (e.g. ORM-generated folders like `migrations/0000_init/migration.sql`).

`migrations_pattern` is a glob (relative to the wrangler config file) and defaults to `${migrations_dir}/*.sql`, which preserves today's behaviour. Files that do not match the pattern are not executed.

```jsonc
{
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "my-db",
			"database_id": "...",
			"migrations_dir": "migrations",
			"migrations_pattern": "migrations/*/migration.sql",
		},
	],
}
```

When no migrations match the configured pattern but files matching the common `migrations/*/migration.sql` (drizzle-style) layout do exist, Wrangler logs a hint suggesting `migrations_pattern` as an opt-in.

`wrangler d1 migrations create` now returns an actionable error if the generated migration filename would not match the configured pattern.
