---
"@cloudflare/vite-plugin": patch
---

Use `database_id` for D1 bindings in remote preview uploads

Consume the corrected Worker upload metadata serializer through the shared deployment helpers. Existing D1 binding configuration continues to use `database_id`.
