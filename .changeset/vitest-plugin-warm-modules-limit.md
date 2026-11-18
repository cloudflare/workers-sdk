---
"@cloudflare/vitest-plugin": patch
---

Fix test files crashing with "Message is too large" when Vitest's filesystem module cache holds a large import graph

With `fsModuleCache` enabled, the pool sent every cached module to a new test file's worker in one WebSocket message. Once that message passed workerd's 32 MiB limit, workerd closed the socket with code 1009 and Vitest reported "Worker exited unexpectedly". The pool now sends only the cached modules that fit, and Vitest fetches the rest one at a time.

When the runner's WebSocket closes unexpectedly, the pool now also logs the close code and reason, so this kind of failure is easier to diagnose.
