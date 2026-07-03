---
"@cloudflare/workers-auth": minor
---

Export a generic `getClientIdFromEnv` that reads `CLOUDFLARE_OAUTH_CLIENT_ID` (undefaulted), so a delegated tool can be told which OAuth app minted the stored token it is refreshing.
