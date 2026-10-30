---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix WebAssembly stack frames printing as `at [object Object]` in source-mapped errors

Source mapping passes `wasm://` call sites through unchanged and stringifies them, which only works with V8's own call sites. The call sites parsed from error strings now stringify to their original text, so WebAssembly frames are preserved.
