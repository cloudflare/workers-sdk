---
"wrangler": patch
---

Let `CLOUDFLARE_ACCOUNT_ID` override the cached account id in `wrangler pages project` commands

`pages project list`, `pages project create` and `pages project delete` passed the internal Pages cache (`pages.json`) straight to account selection, which treats `account_id` as user-authored configuration and therefore ranks it above `CLOUDFLARE_ACCOUNT_ID`. In a multi-account setup a stale cached account won silently, so the command targeted the wrong account and failed with `Authentication error [code: 10000]`.

These three commands now overlay the environment account id on top of the cache before resolving auth, which is what `pages deploy`, `pages deployment list`, `pages deployment delete`, `pages download config` and `pages secret` already do. The cache is still used as a fallback when the environment variable is unset.
