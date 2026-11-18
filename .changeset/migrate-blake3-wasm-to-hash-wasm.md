---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Replace the unmaintained asset hashing dependency with `hash-wasm`

Keep asset hashes unchanged for Workers and Pages deployments and local Pages development while using a maintained WebAssembly implementation.
