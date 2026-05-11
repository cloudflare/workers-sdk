---
"wrangler": patch
---

Fix race in `RemoteProxySession.updateBindings` so it waits for the remote worker to finish reloading with the new bindings before resolving

Previously, `updateBindings` resolved as soon as the config update event was dispatched, long before the remote worker had been re-uploaded and the local proxy worker had unpaused. Callers that issued requests immediately afterwards could see flaky failures — typically "WebSocket connection failed" for JSRPC bindings such as service bindings or dispatch namespaces — because the local proxy worker was still in its paused state during the reload window. `updateBindings` now waits for the next `reloadComplete` event and for the local proxy worker's runtime-message queue to drain before returning, so callers can safely issue requests after `await session.updateBindings(...)`. If the reload fails, the rejection from `updateBindings` carries the underlying error.
