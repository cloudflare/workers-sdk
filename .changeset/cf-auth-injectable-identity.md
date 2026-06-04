---
"@cloudflare/workers-auth": minor
---

Make the OAuth identity and token storage injectable, and add a shared env-credential resolver

`createOAuthFlow` now accepts optional `clientId`, `consent` (granted/denied redirect pages), `callback` (host/port + registered `redirect_uri`), and `storage` (a pluggable `AuthConfigStorage`) on its context. All default to Wrangler's existing behaviour, so current consumers are unaffected. This lets other Cloudflare CLIs reuse the flow under their own OAuth app, consent pages, callback port, and a different storage location/format (e.g. a JSONC file).

Also hoists the shared env→credential resolution here: `getAuthFromEnv`, `getAPIToken`, `requireApiToken`, and the credential env getters (`getCloudflareAPITokenFromEnv`, `getCloudflareGlobalAuthKeyFromEnv`, `getCloudflareGlobalAuthEmailFromEnv`). `getAuthFromEnv`/`getAPIToken` accept `allowGlobalAuthKey` so a CLI can opt out of global API key + email support, and `getAPIToken` accepts an injected `storage`.
