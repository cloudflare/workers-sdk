---
"wrangler": patch
---

Fix Bun compatibility issues in Wrangler when deploying assets and performing API requests

- Replaced the platform-specific native WASM `blake3-wasm` dependency with the pure-JS `@noble/hashes` library for robust file hashing under Bun.
- Added type-safe conditional fallbacks in the Cloudflare API fetch client to leverage native `globalThis.fetch` under the Bun runtime to prevent connection pool hanging and early process exits.
- Implemented transparent FormData cloning to correctly serialize `undici` `FormData` instances as native `globalThis.FormData` bodies when running under Bun, ensuring correct API boundary headers.
