---
"@cloudflare/vitest-pool-workers": patch
---

Use today's date for the RTTI compat date query instead of a hardcoded `"2023-12-01"`, so newly added Node.js builtin modules are recognized by the module fallback service.
