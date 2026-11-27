---
"@cloudflare/vitest-plugin": patch
---

Fix the Workers runtime exiting before the next test file when a large Worker is loaded through `cloudflare:test`

When a setup file imported `cloudflare:test` and one worker ran several test files in a row, such as with `--maxWorkers=1`, the second file failed with "Worker exited unexpectedly" if the Worker's `main` module graph was large. The pool sent every module the file needed as one message, which could exceed the runtime's 32 MiB WebSocket message limit. The pool now sends only part of that code at once, and the rest is fetched module by module.
