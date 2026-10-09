---
"@cloudflare/vitest-plugin": patch
---

Fix Vitest 5 tests failing with `fsModuleCache: true`

Vitest returns paths to cached transformed modules, but the Workers test runner cannot read the host filesystem. The pool now sends transformed code already available in Vite's module graph to the runner, including modules in Vitest's warm cache snapshot.
