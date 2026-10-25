---
"@cloudflare/vitest-plugin": patch
---

Fix Worker tests failing when CommonJS dependencies require packages with separate `import` and `require` entries on Vite 8. The fix needs Vite 8.2.1 or later; Vite 8.0.x, 8.1.x and 8.2.0 stay affected.
