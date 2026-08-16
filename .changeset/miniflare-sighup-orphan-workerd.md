---
"miniflare": patch
---

Terminate `workerd` when the Miniflare process receives `SIGHUP`

Miniflare listened for `SIGINT` and `SIGTERM` but not `SIGHUP`, so on `SIGHUP` it exited without running any handler: `dispose()` never ran, the `SIGKILL` that stops `workerd` was never reached, and the child was left running with no parent. This mostly affected tools that embed Miniflare, such as `@cloudflare/vitest-pool-workers` and `@cloudflare/vite-plugin`, where nothing else cleans up the runtime. `SIGHUP` is now handled like the other termination signals, so `workerd` is stopped and the temporary directory is removed.
