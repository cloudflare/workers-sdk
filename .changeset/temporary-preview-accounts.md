---
"wrangler": minor
"@cloudflare/workers-auth": minor
---

Add a `--temporary` flag that creates and uses a temporary Cloudflare preview account when you have no credentials, instead of starting the OAuth login flow.

It's registered only on the commands the short-lived account token can serve — Workers (`deploy`, `versions upload`, and related commands), KV, D1, Hyperdrive, Queues, and certificate commands — and is for unauthenticated use only: passing it while already authenticated (OAuth, `CLOUDFLARE_API_TOKEN`, or a global API key) errors rather than silently ignoring the flag. Before provisioning, Wrangler handles Cloudflare's Terms of Service and Privacy Policy (interactive terminals prompt for `yes`; non-interactive shells print a notice and continue). Wrangler then runs with the short-lived token and prints a claim URL so the account can be claimed before it expires. The cached account is cleared on successful login or logout.
