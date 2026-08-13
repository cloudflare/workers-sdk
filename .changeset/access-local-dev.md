---
"miniflare": minor
"wrangler": minor
---

Add local dev simulation for Cloudflare Access `ctx.access.getIdentity()`

You can now configure a mock Cloudflare Access identity in `wrangler.json` so that `ctx.access.getIdentity()` returns it during local development.

```jsonc
// wrangler.json
{
	"access": {
		"dev": {
			"aud": "my-app-aud-tag",
			"identity": {
				"email": "user@example.com",
				"name": "Test User",
			},
		},
	},
}
```
