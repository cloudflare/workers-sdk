---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Replace the `blake3-wasm` dependency with `@noble/hashes` for asset content hashing.

We are still using BLAKE3, so asset hashes should be unchanged.
