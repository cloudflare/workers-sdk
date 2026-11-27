---
"@cloudflare/vite-plugin": patch
---

Use `database_id` for D1 bindings in remote preview uploads

Remote D1 bindings can connect to the configured database because preview uploads now use the field expected by the Workers API. Existing D1 binding configuration continues to use `database_id`.
