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

Add experimental Workers identity bindings and native caller support in local development

Configure an optional fixed token audience and separate authorization-grant or HTTP origin/method limits. Use fresh `getToken()` assertions, opt-in `getAuthorizationGrant()` calls, and `getIdentity(label?)` RPC handles for managed Web Bot Auth signing. Preserve configuration through uploads, Previews, and generated types, with exact audience validation and no identity resource provisioning.

Select a handle before fetching, await its metadata, and use normal RPC forwarding and disposal. Normalize URL, FormData, and URLSearchParams inputs with `new Request(...)`; AbortSignal transport and cross-RPC cancellation are outside the contract. Local issuance remains unsupported: use mocks or deployed Previews.

For a companion runtime, expose local immediate callers through ordinary configured service bindings. HTTP credential verification is unavailable locally without a managed verifier channel.
