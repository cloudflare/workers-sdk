---
"@cloudflare/vitest-plugin": patch
---

Fix test runs slowing down file after file, and stalling, with `isolate: false`

With `isolate: false`, Vitest hands a worker's module runner to the pool again for every test file the worker runs, and the pool wrapped the runner's module fetches in one more layer each time, so imports got slower with every file until runs stalled. The pool now patches each module runner once.
