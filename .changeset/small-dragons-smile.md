---
"wrangler": minor
---

Add per-Worker resource accessors to `createTestHarness()`

`createTestHarness()` now provides methods for accessing configured KV namespaces, R2 buckets, D1 databases, and Durable Object namespaces. Use `server.getWorker(name)` to access resources scoped to that specific Worker:

```ts
const worker = server.getWorker("api-worker");
const bucket = await worker.getR2Bucket("BUCKET");
const db = await worker.getD1Database("DB");
```
