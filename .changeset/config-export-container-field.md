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

Containers are only supported on the SQLite storage engine, so `container` is only offered alongside `storage: "sqlite"`. Passing it with `storage: "legacy-kv"` is a type error rather than something only caught on deploy:

```typescript
exports.durableObject({
	storage: "legacy-kv",
	// Object literal may only specify known properties,
	// and 'container' does not exist in type '{ storage: "legacy-kv" }'
	container: "my-container",
});
```

This is an experimental feature: containers themselves are not yet configurable from `cloudflare.config.ts`, so the field is only useful once they are.
