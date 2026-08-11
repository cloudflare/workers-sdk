---
"@cloudflare/vitest-pool-workers": patch
---

Improve module resolution for dependencies with CommonJS and ES module builds

These dependencies could previously be loaded with the wrong module type depending on import order, causing syntax errors or missing exports in tests. Each entry point is now loaded using its correct module format.
