---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add a new `subrequests` limit to the `limits` field of the Wrangler configuration file

Before only the `cpu_ms` limit was supported in the `limits` field of the Wrangler configuration file, now a `subrequests` limit can be specified as well which enables the user to limit the number of fetch requests that a Worker's invocation can make.

Example:

```json
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"limits": {
		"cpu_ms": 1000,
		"subrequests": 150 // newly added field
	}
}
```
