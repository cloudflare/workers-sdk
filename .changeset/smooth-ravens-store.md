---
"wrangler": minor
"miniflare": minor
---

Add Durable Object storage access to `createTestHarness()`

You can now execute SQL against a SQLite-backed Durable Object to seed or assert the storage state.

```ts
const server = createTestHarness({
	workers: [{ configPath: "./wrangler.json" }],
});
await server.listen();

const worker = server.getWorker();
const storage = await worker.getDurableObjectStorage("COUNTER", {
	name: "user-123",
});

await worker.fetch("/counter/user-123");

const rows = await storage.exec(
	"SELECT value FROM counters WHERE id = ?",
	"user-123"
);
expect(rows).toEqual([{ value: 1 }]);
```
