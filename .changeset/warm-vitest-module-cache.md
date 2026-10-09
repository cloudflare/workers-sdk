---
"@cloudflare/vitest-plugin": patch
---

Fix Vitest 5 tests failing with `fsModuleCache: true`

Vitest returns paths to cached transformed modules, but the Workers test runner cannot read the host filesystem. The pool now reads cached modules on the Node.js side before sending them to the runner, including modules in Vitest's warm cache snapshot.
