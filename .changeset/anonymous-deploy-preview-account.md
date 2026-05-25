---
"wrangler": minor
---

Add `--allow-anonymous` to `wrangler deploy`

`wrangler deploy --allow-anonymous` can now create a temporary preview account when you are not already authenticated, instead of starting the OAuth login flow. Wrangler deploys with the short-lived account token and prints a claim URL so the account can be claimed later. The cached anonymous preview account is cleared on successful OAuth login or logout so a stale account is not reused after switching back to authenticated usage.
