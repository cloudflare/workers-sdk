---
"miniflare": patch
---

Fix resource leaks during config updates

Two follow-up fixes to the dispose cleanup in #13515:

- Only close and recreate the dev-registry dispatcher when its port actually changes, matching the existing `runtimeDispatcher` behavior. Previously, every config update unconditionally tore down and rebuilt the connection pool, which could cause brief request failures if a registry push was in-flight.
- Dispose old `InspectorProxy` instances before replacing them during `updateConnection()`. Previously, stale proxies were silently discarded, leaking their runtime WebSocket connections and 10-second keepalive interval timers.
