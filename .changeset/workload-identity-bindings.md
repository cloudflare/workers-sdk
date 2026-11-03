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

Configure token audiences, authorization grants, HTTP signing, and managed OAuth through identity bindings. Use `getToken()`, `getAuthorizationGrant()`, and selected `getIdentity(agentId?)` RPC handles. Managed OAuth supports workload authorization and client credentials, automatic DPoP, and optional Web Bot Auth signatures. Configuration, migration, uploads, Previews, and generated types preserve these capabilities.

Miniflare runs signing, discovery, verification, and replay protection with separate local keys and no cloud login. Cooperating Workers share one local graph; persisted restarts retain keys and replay state. With the companion runtime and `enable_workload_identity_context`, `ctx.identity.caller()` verifies local HTTP credentials and identifies immediate service-binding callers.

Account-owned connectors support app and customer selection, staged consent, status, defaults, disconnect and private provisioning. Saved handles expose fetch/status without token export. Literal configuration generates only the permitted selectors and management methods. URL/origin permissions and independent connector ceilings retain their scope through uploads and readback.

Shared local support runs the source-built connection broker and standards fixtures through ordinary cf, Wrangler, Vite and Vitest workflows. Local authority, connector/grant state and replay protection persist together in a project-scoped realm; ownership conflicts and old formats require explicit recovery. Live-provider qualification requires explicit opt-in.
