---
"@cloudflare/vitest-plugin": patch
---

Patch a reused worker's module runner once

With `isolate: false`, Vitest hands a worker's module runner to the pool again for every test file the worker runs, and the pool wrapped the runner's `transport.invoke`, `createRequire` and `createImportMeta` in one more layer each time. Module imports then got slower file after file until runs stalled. The pool now patches each module runner once.
