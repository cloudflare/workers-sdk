---
"miniflare": patch
---

Fix short-lived local sessions hanging instead of exiting after `dispose()`

A Miniflare instance using shared local storage could keep the Node process alive after `dispose()` resolved, because a filesystem watcher on the dev registry directory was left running. A one-shot local command would do its work and print its result, then never exit — `cf d1 migrations apply --local`, for example, applied every migration successfully and still had to be killed. Disposal now releases the watcher reliably, so the process exits on its own.
