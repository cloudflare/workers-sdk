---
"miniflare": minor
---

Add telemetry to local REST API

The local REST API (used by the local explorer) now collects anonymous usage telemetry. This respects any existing global telemetry preferences, which can be disabled by running the command `wrangler telemetry disable`.

No actual data values, keys, query contents, or resource IDs are collected.

**Event schema:**

```json
{
	"event": "localapi.<route>.<method>", // e.g. localapi.kv.keys.get
	"deviceId": "<uuid>",
	"timestamp": 1234567890,
	"properties": {
		"userAgent": "Mozilla/5.0 ...",
		// Only for localapi.local.workers.get:
		"workerCount": 2,
		"kvCount": 3,
		"d1Count": 1,
		"r2Count": 0,
		"doCount": 1,
		"workflowsCount": 0
	}
}
```

Note: the Local Explorer and corresponding local REST API is still an experimental feature.
