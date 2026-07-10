---
"wrangler": minor
---

Add Durable Object eviction support to `createTestHarness`

You can now gracefully evict a running Durable Object by class name or binding name to verify how it recovers after its instance is torn down:

```ts
const worker = server.getWorker();
await worker.evictDurableObject("Counter", { name: "user-123" });
```
