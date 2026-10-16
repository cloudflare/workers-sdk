---
"wrangler": patch
---

Fail fast when `createTestHarness()` cannot dispatch requests under Bun

Bun's `fetch()` ignores the undici `dispatcher` that Miniflare routes requests through. Under Bun, `server.fetch()` and requests to the URL returned by `listen()` used to hang forever with no error, and `server.getWorker().fetch()` could send a request to the network instead of the Worker. `listen()` now resolves, `server.fetch()` and `server.getWorker()`'s `fetch()`, `email()` and `scheduled()` throw an actionable `UserError` before sending anything, and the ProxyWorker answers requests to the `listen()` URL with a 503 that names the cause. `server.getWorker().getEnv()` and `getExport()` keep working under Bun.
