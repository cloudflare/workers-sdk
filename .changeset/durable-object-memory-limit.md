---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add a new `durable_object_memory_mb` limit to the `limits` field of the Wrangler configuration file

The `limits` field now accepts a `durable_object_memory_mb` setting that controls the memory available to each isolate hosting the Durable Objects exported by this Worker. Valid values are `128` (the default), `256` and `512`. The setting does not affect the Worker's stateless invocations. It is also supported under `previews.limits`.

Wrangler warns if `durable_object_memory_mb` is set but the Worker does not export any Durable Objects, since the limit would have no effect.

Example:

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"limits": {
		"durable_object_memory_mb": 256, // newly added field
	},
}
```
