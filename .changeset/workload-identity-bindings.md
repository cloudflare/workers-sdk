---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Replace implicit context OIDC access with explicit identity bindings.

Configure an existing identity with its approved audience policy, then call `env.IDENTITY.getToken({ audience, fresh })`. Preserve bindings through cf configuration, uploads, Previews, local runtime configuration, and generated types. Configuration requests an approved assignment; it cannot create one.

Recheck OAuth, Worker access, and the current local assignment on every getter. Keep session renewal lazy, forward every fresh request separately, and reject sessions that do not match the configured identity and audience policy. Local Durable Objects use the local identity profile. Vitest still requires an explicit live-issuance opt-in.

Native execution requires the matching workerd identity-binding implementation and Cloudflare authorization services. Until a runtime release includes those changes, use `MINIFLARE_WORKERD_PATH` with that build.
