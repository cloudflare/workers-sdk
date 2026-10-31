---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Add fixed-audience `identities` bindings with fresh `getToken()`, opt-in WAGs, and signed HTTP dispatch. Preserve configuration through uploads, Previews, local development and generated types.

Derive subjects from protected platform IDs. Compile each binding into a private Worker service capability and preserve its original authority through RPC forwarding. Use the existing wrapped-binding serializer for the public three-method interface.

Local calls require current human OAuth and permission to develop an existing named Worker. Keep credentials outside application code and cache only the eight-hour session. Vitest requires explicit live-issuance opt-in.
