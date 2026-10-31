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

Add fixed-audience `identities` bindings with fresh `getToken()`, opt-in WAGs, and signed HTTP dispatch. Preserve configuration through uploads, Previews, local development and generated types.

Derive subjects from protected platform IDs. Compile each binding into a private Worker service capability and preserve its original authority through RPC forwarding. Expose the three-method interface directly over JSRPC. Select the default or labeled HTTP identity with `getIdentity()` and sign through its returned RPC fetcher.

Local calls report that issuance is unsupported. Use deployed Previews for real tokens, grants and signed requests, or supply mocks in tests.
