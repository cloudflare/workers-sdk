---
"wrangler": patch
---

Fix the `wrangler tail` command leaking a signal-exit listener after the tail has been cleanly closed.

The tail command registered both a `tail.on("close", exit)` listener and a process-level `onExit(exit)` handler, but never removed the latter after `exit()` had run. In long-lived CLI processes this is harmless — the handler eventually runs once on shutdown — but in unit tests that repeatedly invoke `wrangler tail`, every invocation accumulates a handler that fires during test-runner shutdown. Those late invocations call `deleteTail()` after the test's auth mocks have been torn down, producing spurious "Not logged in" unhandled rejections which fail the Linux CI runs.

The handler is now removed as soon as `exit()` runs, and `exit()` is guarded against re-entry so it is idempotent if both the WebSocket `close` event and a real signal fire for the same session.
