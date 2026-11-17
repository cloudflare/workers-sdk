---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/containers-shared": minor
"@cloudflare/config": minor
---

Store experimental Durable Object-managed Container images in a jurisdiction

Images for Containers using `scheduling_policy: "durable_object"` can now set `jurisdictions` to `"eu"`, `"fedramp"`, or `"us"`. Only one jurisdiction can be listed for now.

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

In the public compliance region, each jurisdiction has its own managed registry, with the same authentication as the default managed registry:

- `eu`: `eu.registry.cloudflare.com`
- `fedramp`: the FedRAMP Moderate registry, `frm.registry.cloudflare.com`
- `us`: `us.registry.cloudflare.com`

Dockerfile images are pushed to their jurisdiction's registry, and prebuilt `image` entries must be digest-pinned references in it. In the FedRAMP High compliance region, every image already uses that region's registry, `registry.fed.cloudflare.com`, so `jurisdictions` doesn't change where images are stored. Images without `jurisdictions` keep using the default managed registry.

In the public compliance region, `wrangler containers registries credentials` now also returns credentials for these registries, for example to push prebuilt images, and `wrangler containers registries configure` treats them as managed registries that need no configuration. `@cloudflare/config` adds the same setting to Durable Object-managed `defineContainer()` images and keeps it in the Build Output.
