---
"wrangler": minor
---

Generate typed pipeline bindings from stream schemas

When running `wrangler types`, pipeline bindings now generate TypeScript types based on the stream's schema definition. This gives you full autocomplete and type checking when sending data to your pipelines.

```jsonc
// wrangler.json
{
	"pipelines": [{ "binding": "ANALYTICS", "pipeline": "analytics-stream-id" }],
}
```

If your stream has a schema with fields like `user_id` (string) and `event_count` (int32), the generated types will be:

```typescript
declare namespace Cloudflare {
	type AnalyticsStreamRecord = { user_id: string; event_count: number };
	interface Env {
		ANALYTICS: Pipeline<Cloudflare.AnalyticsStreamRecord>;
	}
}
```

For unstructured streams or when not authenticated, bindings fall back to the generic `Pipeline<PipelineRecord>` type.
