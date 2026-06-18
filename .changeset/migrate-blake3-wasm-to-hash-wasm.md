---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Replace the unmaintained `blake3-wasm` dependency with `hash-wasm`

The `blake3-wasm` package used to hash assets during deploys is no longer maintained (its latest release declares a dependency on a version that was never published) and ships as CommonJS. It has been swapped for `hash-wasm`, a maintained, pure-ESM, zero-dependency BLAKE3 implementation that inlines its WebAssembly binary so it bundles cleanly and keeps WASM-level hashing speed. Asset manifest hashes are byte-for-byte identical, so deploys are unaffected.
