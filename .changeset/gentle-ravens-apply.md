---
"wrangler": minor
---

Add D1 migration setup to `createTestHarness()` Worker handles

Tests using `createTestHarness()` can now apply local D1 migrations before running requests:

```ts
const worker = server.getWorker();

beforeEach(async () => {
	await worker.applyD1Migrations("DATABASE");
});
```
