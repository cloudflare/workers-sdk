---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Fail with an error instead of hanging when local dev requests can't work under Bun

Bun's `fetch()` ignores the undici `dispatcher` that Miniflare routes requests through (oven-sh/bun#39247). Under Bun, `createTestHarness()`'s `server.fetch()` and `server.getWorker()`'s `fetch()`, `email()` and `scheduled()` now throw a `UserError`, requests to the dev server URL get a 503 naming the cause, and starting remote bindings throws a `UserError`. Each of these used to hang with no error. `server.getWorker().getEnv()` and `getExport()` keep working under Bun.
