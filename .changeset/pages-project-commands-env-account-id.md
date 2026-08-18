---
"wrangler": patch
---

Respect `CLOUDFLARE_ACCOUNT_ID` in `wrangler pages project list`, `create` and `delete`

These three commands could target a previously used account even when `CLOUDFLARE_ACCOUNT_ID` was set, failing with `Authentication error [code: 10000]` in setups with more than one account. They now use the account named by `CLOUDFLARE_ACCOUNT_ID`, matching the rest of `wrangler pages`. When the variable is unset, the previously used account is still selected, as before.
