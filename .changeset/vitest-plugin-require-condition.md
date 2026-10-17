---
"@cloudflare/vitest-plugin": patch
---

Pass the import kind to Vite in the module fallback so a `require()` picks the `require` export condition on Vite 8
