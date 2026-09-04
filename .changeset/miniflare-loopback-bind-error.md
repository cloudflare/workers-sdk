---
"miniflare": patch
---

Reject loopback server bind failures during Miniflare startup instead of leaving `ready` and `dispose()` hanging

`#startLoopbackServer` now attaches an `error` listener before `listen`, matching the inspector proxy. When the configured host cannot be bound (e.g. `192.0.2.1`), `ready` rejects and `dispose()` still settles even if the loopback server never started.
