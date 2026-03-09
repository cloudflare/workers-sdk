---
"wrangler": minor
---

Support disabling persistence in `unstable_startWorker()` and `unstable_dev()`

You can now disable persistence entirely by setting `persist: false` in the `dev` options:

```typescript
const worker = await unstable_dev("./src/worker.ts", {
	persist: false,
});
```

Or when using `unstable_startWorker()`:

```typescript
const worker = await unstable_startWorker({
	entrypoint: "./src/worker.ts",
	dev: {
		persist: false,
	},
});
```

This is useful for testing scenarios where you want to ensure a clean state on each run without any persisted data from previous runs.
