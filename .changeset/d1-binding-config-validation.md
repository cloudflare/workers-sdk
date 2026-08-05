---
"@cloudflare/workers-utils": patch
---

Validate optional configuration fields for D1 database bindings

Enforce type checks for the optional D1 database properties `database_name`, `migrations_dir`, `migrations_table`, and `database_internal_env` to ensure consistency with other binding types.
