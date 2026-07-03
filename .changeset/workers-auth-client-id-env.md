---
"@cloudflare/workers-auth": minor
---

Read the OAuth-flow environment variables under their CLI-neutral `CLOUDFLARE_`-prefixed names (`CLOUDFLARE_AUTH_DOMAIN`, `CLOUDFLARE_AUTH_URL`, `CLOUDFLARE_TOKEN_URL`, `CLOUDFLARE_REVOKE_URL`, `CLOUDFLARE_CF_AUTHORIZATION_TOKEN`), keeping the `WRANGLER_`-prefixed equivalents working as deprecated aliases.

Also export a generic `getClientIdFromEnv` that reads `CLOUDFLARE_OAUTH_CLIENT_ID` (undefaulted), so a delegated tool can be told which OAuth app minted the stored token it is refreshing.
