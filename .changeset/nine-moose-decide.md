---
"miniflare": patch
---

fix: support `mf.getBindings()` when dev registry is enabled

Fixes a deadlock when using bindings from `mf.getBindings()` with the dev registry enabled. The deadlock happened because the runtime attempted to resolve a worker address via the loopback server, which was blocked by the Node.js thread waiting on the same runtime.

Address lookup has been moved to a proxy running in a worker thread to avoid blocking the main thread.
