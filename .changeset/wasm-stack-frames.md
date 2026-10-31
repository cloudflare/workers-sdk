---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix WebAssembly stack frames printing as `at [object Object]` in source-mapped errors

WebAssembly frames in source-mapped error stack traces now show their original function and location instead of `[object Object]`.
