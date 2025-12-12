---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add type generation support to `wrangler dev`

You can now have your worker configuration types be automatically generated when the local Wrangler development server starts.

To use it you can either:

1. Add the `--types` flag when running `wrangler dev`.

2. Update your Wrangler configuration file to add the new `dev.generate_types` boolean property.

```json
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "example",
	"main": "src/index.ts",
	"compatibility_date": "2025-12-12",
	"dev": {
		"generate_types": true
	}
}
```
