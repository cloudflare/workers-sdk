---
"wrangler": patch
---

Use the shared env-credential resolver from `@cloudflare/workers-auth`

Internal refactor: `getAuthFromEnv`, `getAPIToken`, and `requireApiToken` now delegate to the shared implementation in `@cloudflare/workers-auth`, and the credential env getters are re-exported from there. No user-facing behaviour change — credential resolution order (global API key + email, then `CLOUDFLARE_API_TOKEN`, then stored OAuth token) is preserved.
