---
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Support remote Analytics Engine bindings in local development

Setting `remote: true` on an Analytics Engine dataset now sends `writeDataPoint()` calls from `wrangler dev` and the Vite plugin to the real dataset. Without it, writes are still dropped locally.

```jsonc
{
	"analytics_engine_datasets": [
		{
			"binding": "EVENTS",
			"dataset": "my-dataset",
			"remote": true,
		},
	],
}
```
