---
"miniflare": patch
---

Fix local rate limiting being disabled entirely when bindings share a `namespace_id` but use different periods

The emulated Ratelimit binding tracked one counter per key per namespace, ignoring the period. Two bindings pointing at the same `namespace_id` with different `simple.period` values therefore overwrote each other's counter on every call — each one seeing a window it did not recognise, and so resetting the count to zero — with the result that neither binding ever limited anything:

```jsonc
{
	"ratelimits": [
		{
			"name": "BURST",
			"namespace_id": "1001",
			"simple": { "limit": 20, "period": 10 },
		},
		{
			"name": "SUSTAINED",
			"namespace_id": "1001",
			"simple": { "limit": 50, "period": 60 },
		},
	],
}
```

Counters are now tracked per period, matching production, where a counter is identified by a bucket index and bucket start timestamp that are both derived from the period. Bindings that share a `namespace_id` and a period still share a counter for a given key.
