---
"@cloudflare/vite-plugin": minor
---

Support `run_worker_first`.

`run_worker_first` has been expanded to accept an array of routes that should go directly to your Worker. Additionally, routes can be omitted by adding a `!` prefix. These negative routes will be treated as assets.

This is a new way to define routing explicitly and, when provided, overrides the implicit routing behavior.

```jsonc
{
	"assets": {
		"not_found_handling": "single-page-application",
		"run_worker_first": [
			"/api/*", // These routes go directly to the Worker
			"!/api/docs/*", // These routes are still treated as assets
		],
	},
}
```

The previous behavior of setting `"run_worker_first": true` to always invoke your Worker is also now supported.
