---
"wrangler": patch
---

Fix D1 remote database resolution to fall back to `database_name` when a binding in config does not have a `database_id`. This allows commands like `wrangler d1 migrations apply --remote` to work after [deploy-time auto provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning).
