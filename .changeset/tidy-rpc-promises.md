---
"miniflare": patch
---

Fix Workflow creation deadlocking when called through a synchronous Node.js RPC proxy

Workflow storage bookkeeping now runs on a dedicated Node.js worker thread, so it can respond while the calling thread waits for an RPC result. This fixes Workflow creation through Wrangler's `createTestHarness().getWorker().getExport()` API without changing RPC return values, factories, or errors exposed by Miniflare and `getPlatformProxy()`. Workflow deletion continues to serialize pending deletions and wait for SQLite cleanup before reusing an instance ID.
