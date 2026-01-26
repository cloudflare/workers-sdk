---
"@cloudflare/vitest-pool-workers": patch
---

Fix CommonJS `require()` of `.json` files in the module fallback service (avoids `SyntaxError: Unexpected token ':'`).
