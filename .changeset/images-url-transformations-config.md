---
"@cloudflare/workers-utils": minor
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"@cloudflare/deploy-helpers": patch
"wrangler": minor
---

Add `images.url_transformations` to the Wrangler configuration

The `images` block now accepts a `url_transformations` object for controlling `/cdn-cgi/image/` transformations on requests served by a Worker. `enabled` is required, and `allowed_origins` optionally lists the origins images may be fetched from (use `["*"]` to allow any origin). `binding` is now optional, so `url_transformations` can be configured without an Images binding:

```jsonc
{
	"images": {
		"url_transformations": {
			"enabled": true,
			"allowed_origins": ["images.example.com"],
		},
	},
}
```

Like the rest of the `images` block, `url_transformations` is not inherited by named environments, and must be specified in each environment that needs it.

`cloudflare.config.ts` gains the equivalent setting as a top-level `images` field on the Worker, with the Images binding remaining in `env`:

```ts
export default defineConfig({
	worker: {
		name: "my-worker",
		compatibilityDate: "2026-11-01",
		images: {
			urlTransformations: {
				enabled: true,
				allowedOrigins: ["images.example.com"],
			},
		},
	},
});
```

`cf migrate` carries `images.url_transformations` over to this field.

This change adds configuration and validation only. `url_transformations` is not supported in `previews`.
