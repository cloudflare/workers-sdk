---
"@cloudflare/workers-utils": minor
"@cloudflare/config": minor
"@cloudflare/workers-auth": patch
"miniflare": minor
"wrangler": minor
---

Add support for Messaging namespace bindings

Configure Messaging bindings with a binding name and namespace:

```jsonc
{
	"messaging": [
		{
			"binding": "MESSAGING",
			"namespace": "my-namespace",
		},
	],
}
```

Messaging bindings are available during local development through remote bindings. Until stable runtime types are published, `wrangler types` emits these bindings as `unknown`.
