---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Add cache options for WorkerEntrypoint exports

You can now set cache options on `WorkerEntrypoint` exports:

```jsonc
// wrangler.json
{
	"cache": { "enabled": true },
	"exports": {
		"default": {
			"type": "worker",
			"cache": { "enabled": false },
		},
		"Admin": {
			"type": "worker",
			"cache": { "enabled": true },
		},
	},
}
```

Wrangler sends the `exports` config to the deploy and version upload APIs alongside the existing global `cache.enabled` setting. The platform resolves that global setting plus cache overrides on exports and validates which entrypoint names are cacheable.
