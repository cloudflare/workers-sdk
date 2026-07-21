---
"@cloudflare/vitest-pool-workers": patch
---

fix: tolerate `Miniflare#dispose()` rejections in `CloudflarePoolWorker.stop()`

workerd can segfault (`Received signal #11`) during shutdown on linux-x64 /
WSL2 and macOS-arm64 (see
[cloudflare/workerd#6763](https://github.com/cloudflare/workerd/issues/6763)).
Previously, the rejection from `mf.dispose()` and the remote-proxy session
`dispose()` propagated out of `stop()` and failed the vitest run with exit 1,
even though every test body had already reported as passed.

These disposes are now wrapped with `.catch()` handlers that log the rejection
via `util.debuglog("vitest-pool-workers")` (visible with
`NODE_DEBUG=vitest-pool-workers`) but do not propagate. The upstream workerd
segfault still needs to be fixed in workerd itself; this change only stops the
pool from turning that teardown crash into a test-side exit 1.

Local reproduction (WSL2, @cloudflare/vitest-pool-workers 0.12.21 baseline):

```
Tests  794 passed (794)
❌ vitest exit 1
[vpw:debug] Disposing remote proxy sessions...
[vite:connect] ECONNRESET  → [vitest-pool]: Worker cloudflare-pool emitted error
```

After this change, the same suite reports `794 passed` and exits 0, with the
rejection detail available on stderr under `NODE_DEBUG=vitest-pool-workers`.