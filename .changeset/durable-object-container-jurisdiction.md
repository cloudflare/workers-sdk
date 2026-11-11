---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/containers-shared": minor
"@cloudflare/config": minor
---

Store experimental Durable Object-managed Container images in a jurisdiction

Images for Containers using `scheduling_policy: "durable_object"` can now set `jurisdictions`. Only `"fedramp"` is supported, and only one jurisdiction can be listed for now.

```jsonc
// wrangler.jsonc
{
	"containers": [
		{
			"name": "sandbox",
			"class_name": "Sandbox",
			"scheduling_policy": "durable_object",
			"images": {
				"app": {
					"dockerfile": "./container/Dockerfile",
					"build_context": "./container",
					"jurisdictions": ["fedramp"],
				},
			},
		},
	],
}
```

`fedramp` images use the FedRAMP Moderate registry, `frm.registry.cloudflare.com`, with the same authentication as the default managed registry. Dockerfile images are pushed there, and prebuilt `image` entries must be digest-pinned references in that registry. Images without `jurisdictions` keep using the default managed registry. `wrangler containers registries credentials frm.registry.cloudflare.com` now returns credentials for that registry, for example to push prebuilt images, and `wrangler containers registries configure` treats it as a managed registry that needs no configuration. `@cloudflare/config` adds the same setting to Durable Object-managed `defineContainer()` images and keeps it in the Build Output.
