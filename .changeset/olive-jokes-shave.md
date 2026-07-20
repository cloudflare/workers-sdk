---
"@cloudflare/vitest-pool-workers": patch
---

Treat `webSocketMessage()`, `webSocketClose()` and `webSocketError()` as optional Durable Object handlers

The pool wraps each Durable Object class and installs a prototype method for every default handler before user code is loaded, so `workerd` always sees a handler and always dispatches. When the wrapped class didn't actually define one, the wrapper threw ``<ClassName> exported by <path> does not define a `webSocketClose()` method``, even though deployed Workers silently ignore these events for classes that omit them. A hibernatable Durable Object defining only `webSocketMessage()` would log an uncaught `TypeError` on every close.

These three handlers now no-op when absent, matching deployed behaviour. `alarm()` is unchanged and still reports a missing handler, since `workerd` rejects `setAlarm()` up front on a class without one.
