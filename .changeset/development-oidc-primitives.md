---
"miniflare": minor
"@cloudflare/workers-auth": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Add host-side development identity sessions and bounded request handling.

Read the selected human OAuth profile on every operation. Cancel pending work after authority changes or shutdown. Keep each assertion fresh, including concurrent calls; never cache assertions or coalesce issuance.
