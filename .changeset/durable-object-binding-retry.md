---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Add a `retry` policy to Durable Object bindings

Durable Object bindings accept an optional `retry` object that limits how the runtime retries calls made through the binding:

```jsonc
{
	"durable_objects": {
		"bindings": [
			{
				"name": "COUNTER",
				"class_name": "Counter",
				"retry": { "max_attempts": 5, "timeout_ms": 10000 },
			},
		],
	},
}
```

`max_attempts` is the number of retries after the initial request, from 0 to 10. Zero disables retries. `timeout_ms` is a retry timeout in milliseconds, from 500 to 60,000, measured from the start of the call. It is not a request timeout: the initial request always runs to completion. Omitted properties use the runtime defaults. Wrangler validates both values and preserves the policy in deploy, versions upload, preview, and downloaded configuration metadata.
