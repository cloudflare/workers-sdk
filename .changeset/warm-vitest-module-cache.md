---
"@cloudflare/vitest-plugin": patch
---

Fix Workers tests failing with Vitest's filesystem module cache

Vitest returns paths to cached transformed modules, but the Workers test runner cannot read the host filesystem. The pool now reads cached modules on the Node.js side before sending them to the runner, including modules in Vitest's warm cache snapshot. This supports Vitest 4.1's `test.experimental.fsModuleCache` and Vitest 5's `test.fsModuleCache` without changing either version's default.

Keep `cloudflare:test` imports stable across cached runs while preserving each project's Worker entrypoint.
