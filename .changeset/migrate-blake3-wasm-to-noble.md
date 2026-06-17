---
"wrangler": patch
---

Replace the unmaintained `blake3-wasm` dependency with `@noble/hashes`

The `blake3-wasm` package used to hash assets during deploys is no longer maintained (its latest release declares a dependency on a version that was never published) and ships as CommonJS. It has been swapped for `@noble/hashes`, a maintained, pure-ESM, zero-dependency implementation of BLAKE3. Asset manifest hashes are byte-for-byte identical, so deploys are unaffected.
