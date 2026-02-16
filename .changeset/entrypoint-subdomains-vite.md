---
"@cloudflare/vite-plugin": minor
---

Add `exposeEntrypoints` option for localhost subdomain routing

You can now access worker entrypoints directly via localhost subdomains during development. This is particularly useful in multi-worker setups where you need to reach entrypoints on auxiliary workers. Set `exposeEntrypoints` in your Vite plugin config to enable this:

```ts
cloudflare({
	configPath: "./dashboard/wrangler.json",
	// Expose all entrypoints using their export names as aliases
	// e.g. http://dashboard.localhost:8787/ -> default entrypoint
	exposeEntrypoints: true,
	auxiliaryWorkers: [
		{
			configPath: "./admin/wrangler.json",
			// Or use an object to pick specific entrypoints and customize aliases
			exposeEntrypoints: {
				default: true, // http://admin.localhost:8787/
				ApiEntrypoint: "api", // http://api.admin.localhost:8787/
			},
		},
	],
});
```
