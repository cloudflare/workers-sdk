---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/containers-shared": patch
---

Support per-image build options for experimental Durable Object-managed Containers

Set `build_context` and `build_vars` alongside `dockerfile` in a Container's named `images` entries. Context paths resolve relative to the Wrangler configuration file and default to the Dockerfile's directory. Build variables are passed as Docker build arguments. Entries using the same Dockerfile with different contexts or variables are built separately.

```jsonc
{
	"containers": [
		{
			"class_name": "Sandbox",
			"scheduling_policy": "durable_object",
			"images": {
				"app": {
					"dockerfile": "./docker/Dockerfile",
					"build_context": ".",
					"build_vars": { "APP_ENV": "production" },
				},
			},
		},
	],
}
```
