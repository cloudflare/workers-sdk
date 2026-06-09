---
"wrangler": minor
---

Add a `--temporary` flag to the commands the temporary preview account token can serve

`--temporary` can now create a temporary preview account when you are not already authenticated, instead of starting the OAuth login flow. It applies when a command needs authentication and `--temporary` is passed, and is registered only on the commands the short-lived account token can serve — Workers (`deploy`, `versions upload`, and related commands), KV, D1, Hyperdrive, Queues, and certificate commands. Wrangler then runs with the short-lived account token and prints a claim URL so the account can be claimed before it expires. The cached temporary preview account is cleared on successful OAuth login or logout so a stale account is not reused after switching back to authenticated usage.
