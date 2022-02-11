---
"wrangler": patch
---

feat: import `.wasm` modules in service worker format workers

This allows importing `.wasm` modules in service worker format workers. We do this by hijacking imports to `.wasm` modules, and instead registering them under `[wasm_modules]` (building on the work from https://github.com/cloudflare/wrangler2/pull/409).
