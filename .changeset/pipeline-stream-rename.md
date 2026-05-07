---
"wrangler": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
---

Rename `pipeline` field to `stream` in pipeline bindings configuration

The `pipeline` field inside `pipelines` bindings has been renamed to `stream` to align with the updated API wire format. The old `pipeline` field is still accepted but deprecated and will emit a warning.

Before:

```jsonc
// wrangler.json
{
	"pipelines": [
		{
			"binding": "MY_PIPELINE",
			"pipeline": "my-stream-name",
		},
	],
}
```

After:

```jsonc
// wrangler.json
{
	"pipelines": [
		{
			"binding": "MY_PIPELINE",
			"stream": "my-stream-name",
		},
	],
}
```
