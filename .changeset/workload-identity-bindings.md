---
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Add experimental Workers identity bindings with fully local development

Configure token audiences, authorization grants, HTTP signing, and managed OAuth through identity bindings. Use `getToken()`, `getAuthorizationGrant()`, and selected `getIdentity(label?)` RPC handles. Managed OAuth supports workload authorization and client credentials, automatic DPoP, and optional Web Bot Auth signatures. Configuration, migration, uploads, Previews, and generated types preserve these capabilities.

Miniflare runs signing, discovery, verification, and replay protection with separate local keys and no cloud login. Cooperating Workers share one local graph; persisted restarts retain keys and replay state. With the companion runtime and `enable_workload_identity_context`, `ctx.identity.caller()` verifies local HTTP credentials and identifies immediate service-binding callers.
