---
"wrangler": minor
---

Add Durable Object eviction support to `createTestHarness`

Integration tests can now gracefully evict a currently-running Durable Object by binding name and object name or ID:

```ts
const worker = server.getWorker();
await worker.evictDurableObject("COUNTER", { name: "user-123" });
```

This lets tests verify how a Durable Object recovers after its instance is torn down.
