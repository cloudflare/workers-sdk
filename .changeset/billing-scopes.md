---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Request the billing scopes when logging in with cf and Wrangler

Include `billing:write` in the default OAuth scopes of cf and Wrangler so they can create account subscriptions, which is how products such as R2 are enabled on an account. cf also requests `billing:read`. Existing OAuth sessions need a new login to request the scopes.
