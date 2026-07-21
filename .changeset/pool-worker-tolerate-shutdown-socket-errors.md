---
"@cloudflare/vitest-pool-workers": patch
---

fix: tolerate post-`stop()` socket `error` events when configured

workerd can segfault (`Received signal #11`) during shutdown on linux-x64 /
WSL2 and macOS-arm64 (see
[cloudflare/workerd#6763](https://github.com/cloudflare/workerd/issues/6763)).
After all tests in a file have already reported as passing, the segfault causes
miniflare's WebSocket to dispatch an `error` event; vitest then surfaces that
as `[vitest-pool]: Worker cloudflare-pool emitted error` and fails the run
with exit 1.

This change adds an opt-in `tolerateWorkerShutdownErrors: boolean` option
(default `false`) to the cloudflare-pool worker configuration. When enabled,
`error` events received after `stop()` has begun are logged via
`NODE_DEBUG=vitest-pool-workers` but not forwarded to vitest as fatal. Errors
received while the pool worker is still running are still propagated
unchanged.

This change does **not** alter the behavior of `stop()` itself — for the
dispose-side fix, see #14793 (which wraps `Miniflare#dispose()` and the
remote-proxy session `dispose()` with `.catch()` handlers). Pairing both
options (`tolerateWorkerShutdownErrors: true` + the dispose fix) is what
produces a fully-shutdown-tolerant run.

Scope is a test-side mitigation only — the upstream `Received signal #11`
itself still needs to be fixed in workerd itself.

Reproduction (matches
[cloudflare/workerd#6763](https://github.com/cloudflare/workerd/issues/6763)):

```
Tests  794 passed (794)
❌ vitest exit 1
[vitest-pool]: Worker cloudflare-pool emitted error.
Caused by: Worker exited unexpectedly
```

With `tolerateWorkerShutdownErrors: true`, the same suite reports `794 passed`
and exits 0. The segfault is still printed to stderr; only the test-side exit
suppression changes.
