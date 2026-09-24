---
"wrangler": patch
---

Fail fast when `createTestHarness()` requests cannot reach the proxy under Bun

Bun's `fetch()` ignores the undici `dispatcher` that Miniflare uses to deliver the ProxyWorker's control requests, so under Bun `server.fetch()` and requests to the URL returned by `listen()` used to hang forever with no error. `server.fetch()` now throws an actionable `UserError`, and the ProxyWorker answers requests to the `listen()` URL with a 503 that names the cause. `listen()` and `server.getWorker().fetch()` keep working under Bun, since `getWorker()` dispatches to the Worker directly without going through the proxy.
