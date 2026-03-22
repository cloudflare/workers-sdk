---
"wrangler": minor
---

Add `expose_entrypoints` config for localhost subdomain routing

You can now access worker entrypoints directly via localhost subdomains during `wrangler dev`. This is particularly useful in multi-worker setups (e.g. `wrangler dev -c dashboard/wrangler.json -c admin/wrangler.json`) where you need to reach entrypoints on auxiliary workers. Add `dev.expose_entrypoints` to each worker config and run them together:

Set `true` to expose all entrypoints using their export names as aliases:

```jsonc
// dashboard/wrangler.json
{
	"name": "dashboard",
	"dev": {
		// e.g. http://dashboard.localhost:8787/ -> default entrypoint
		"expose_entrypoints": true,
	},
}
```

Or use an object to pick specific entrypoints and customize their aliases:

```jsonc
// admin/wrangler.json
{
	"name": "admin",
	"dev": {
		"expose_entrypoints": {
			"default": true, // http://admin.localhost:8787/
			"ApiEntrypoint": "api", // http://api.admin.localhost:8787/
		},
	},
}
```
