---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Add cache options for WorkerEntrypoint exports

You can now set cache options on `WorkerEntrypoint` exports and configure cross-version cache behavior globally:

```jsonc
// wrangler.json
{
	"cache": { "enabled": true, "cross_version_cache": true },
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

Wrangler sends the `exports` config to the deploy and version upload APIs alongside the global `cache.enabled` and `cache.cross_version_cache` settings. The platform resolves those global settings plus cache overrides on exports and validates which entrypoint names are cacheable.
