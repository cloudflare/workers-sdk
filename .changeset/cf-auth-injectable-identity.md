---
"@cloudflare/workers-auth": minor
---

Make the OAuth identity and token storage injectable, and add a shared env-credential resolver

`createOAuthFlow` now takes the consumer's OAuth identity (`clientId`, `consent`, `redirectUri`) on its context, with `storage` optional, so other Cloudflare CLIs can reuse the flow under their own OAuth app. Also adds a shared env→credential resolver (`getAuthFromEnv`, `getAPIToken`, `requireApiToken`).
