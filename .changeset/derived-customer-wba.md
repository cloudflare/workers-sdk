---
"@cloudflare/workers-utils": minor
"@cloudflare/config": minor
"miniflare": minor
"wrangler": minor
---

Add managed identity signing configuration

Allow signing-only identity bindings without a token audience and remove protocol selectors. All HTTP identities use managed Web Bot Auth signing. Local identity methods, including getIdentity(), remain unsupported; use deployed Previews or mocks.
