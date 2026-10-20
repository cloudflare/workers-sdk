---
"@cloudflare/config": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
---

Support remote Hyperdrive bindings in local development

```jsonc
{
	"hyperdrive": [
		{
			"binding": "HYPERDRIVE",
			"id": "<your-hyperdrive-id>",
			"remote": true,
		},
	],
}
```
