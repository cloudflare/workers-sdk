---
"@cloudflare/vitest-plugin": patch
---

Wait for work passed to `waitUntil()` from `cloudflare:workers` in `waitOnExecutionContext()`

`waitOnExecutionContext(ctx)` only waited for `ctx.waitUntil()`, so work a Worker passed to the imported `waitUntil()` was never awaited, and its rejections didn't fail the test. Modules loaded by Vitest now get a `waitUntil()` that registers work with the current handler's context, or, outside a handler (such as a unit test calling `worker.fetch(request, env, ctx)` directly), with the most recently created `ExecutionContext`, and still passes it to workerd.
