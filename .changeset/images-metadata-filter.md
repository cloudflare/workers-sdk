---
"miniflare": minor
---

Add metadata filtering to the local Images binding `hosted.list()`

`env.IMAGES.hosted.list()` now accepts a `filter.metadata` option to filter hosted images by their custom metadata, matching the Cloudflare Images REST API. Each key is a metadata field name and its value is the condition the field must meet. A bare value is shorthand for `eq`, and the `eq`, `in`, `gt`, `gte`, `lt`, and `lte` operators are supported. Field names use dot notation to filter on nested fields, and multiple fields are combined with AND logic.

```js
await env.IMAGES.hosted.list({
	filter: {
		metadata: {
			status: "active",
			priority: { gte: 2, lte: 8 },
			"region.name": { in: ["us-east", "eu-west"] },
		},
	},
});
```
