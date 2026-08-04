---
"@cloudflare/config": minor
---

Add a `container` option to `exports.durableObject()`

Live Durable Object exports can now attach a container by name, matching the new `container` field in the Wrangler configuration format:

```typescript
import { defineWorker, exports } from "@cloudflare/config";

export default defineWorker({
	name: "my-worker",
	compatibilityDate: "2026-07-01",
	exports: {
		MyContainerDO: exports.durableObject({
			storage: "sqlite",
			container: "my-container",
		}),
	},
});
```

This is an experimental feature: containers themselves are not yet configurable from `cloudflare.config.ts`, so the field is only useful once they are.
