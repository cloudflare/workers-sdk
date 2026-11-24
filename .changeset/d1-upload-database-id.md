---
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Use `database_id` for D1 bindings in Worker uploads

Worker upload metadata now matches the Workers API schema. Pages bundles continue to use `id` for compatibility with the Pages API. No configuration changes are needed: programmatic config still uses `bindings.d1({ id })`, and Wrangler config files still use `database_id`.
