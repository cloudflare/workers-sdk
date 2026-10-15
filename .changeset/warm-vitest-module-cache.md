---
"@cloudflare/vitest-plugin": patch
---

Fix Workers tests failing with Vitest's filesystem module cache

This supports Vitest 4.1's `test.experimental.fsModuleCache` and Vitest 5's `test.fsModuleCache`.
