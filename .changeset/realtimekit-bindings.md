---
"wrangler": minor
"miniflare": minor
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/codemods": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Add RealtimeKit bindings

Bind an existing RealtimeKit app to a Worker in your Wrangler configuration file:

```jsonc
{
	"realtimekit": [
		{
			"binding": "RTK",
			"app_id": "<APP_ID>",
			"remote": true,
		},
	],
}
```

RealtimeKit has no local simulator, so set `remote: true` to use the real app during local development. Calls during development, including calls on returned meetings, go through the existing remote bindings proxy. The experimental configuration API supports `bindings.realtimeKit({ id: "<APP_ID>", dev: { remote: true } })`, and the `wrangler-to-cf` codemod converts `realtimekit` entries. Deployments upload only the binding name and `app_id`. `wrangler types` generates `RealtimeKitBinding` for these bindings.
