---
"wrangler": minor
---

Add experimental Build Output API support to `createTestHarness()` so tests can run the emitted Worker modules and assets from `.cloudflare/output/v0` in a dedicated Miniflare instance. Requests, Worker handles, updates, and resets use that instance directly. Build Output container images are not started locally.
