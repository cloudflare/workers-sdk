---
"@cloudflare/vitest-plugin": patch
---

Fix Worker tests failing when CommonJS dependencies require packages with separate `import` and `require` entries on Vite 8.
