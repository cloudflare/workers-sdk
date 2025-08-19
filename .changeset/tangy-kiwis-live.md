---
"miniflare": minor
---

feat: add `unsafeRegisterWorker` option to Miniflare

Adds a new option to Miniflare that allows granular control over whether workers should be registered in the dev registry. This prevents internal workers from being exposed, keeping only selected workers visible.

```typescript
const mf = new Miniflare({
	// ... other options
	workers: [
		{
			name: "worker-a",
			// Register this worker in the dev registry
			unsafeRegisterWorker: true,
		},
		{
			name: "worker-b",
			// But not this one
			unsafeRegisterWorker: false,
		},
	],
});
```
