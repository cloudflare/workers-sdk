---
"create-cloudflare": minor
---

Respect `CLOUDFLARE_ACCOUNT_ID` environment variable for account selection

When the `CLOUDFLARE_ACCOUNT_ID` environment variable is set, C3 will now use it directly
instead of prompting for account selection. This matches wrangler's behavior and enables
seamless CI/CD workflows where the account is pre-configured via environment variables.

Previously, C3 would always call `wrangler whoami` and prompt for account selection when
multiple accounts were available, ignoring the environment variable.
