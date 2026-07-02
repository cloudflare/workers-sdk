---
"wrangler": patch
---

Ignore stale cached account IDs when resolving the active account

Wrangler now verifies cached account selections against the accounts available to the current authentication before using them for commands. This prevents a parent `node_modules/.cache/wrangler` account cache from silently sending requests to an account that does not belong to the current token, and `wrangler whoami` now surfaces the active account source.
