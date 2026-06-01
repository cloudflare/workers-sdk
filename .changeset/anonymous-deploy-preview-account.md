---
"wrangler": minor
---

Add `--allow-anonymous` to `wrangler deploy`, `wrangler versions upload`, and Pages commands

`--allow-anonymous` can now create a temporary preview account when you are not already authenticated, instead of starting the OAuth login flow. It applies to any command that requires authentication non-interactively — including `wrangler deploy`, `wrangler versions upload`, and the Pages commands. Wrangler deploys with the short-lived account token and prints a claim URL so the account can be claimed later. The cached anonymous preview account is cleared on successful OAuth login or logout so a stale account is not reused after switching back to authenticated usage.
