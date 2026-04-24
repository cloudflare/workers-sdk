---
"wrangler": patch
---

fix: prioritise `CLOUDFLARE_ACCOUNT_ID` over a cached account id for all Pages commands

Previously, some Pages commands (`pages deploy`, `pages deployment list/delete/tail`, `pages download config`, `pages secret`) used a cached account id over the `CLOUDFLARE_ACCOUNT_ID` environment variable. The `pages project` commands already correctly prioritised `CLOUDFLARE_ACCOUNT_ID`.
