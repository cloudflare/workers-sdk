---
"@cloudflare/config": patch
---

Fix declaration emit for values returned by `defineSettings`

Projects can now export a `defineSettings()` result while generating TypeScript declarations without encountering TS4023.
