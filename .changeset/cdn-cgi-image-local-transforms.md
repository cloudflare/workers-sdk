---
"miniflare": minor
"wrangler": minor
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"@cloudflare/vite-plugin": minor
---

Add local development support for `/cdn-cgi/image/` URL transformations

When `images.url_transformations` is enabled, Miniflare now handles `/cdn-cgi/image/<options>/<source>` requests locally before they reach your Worker. Requests return a 404 when URL transformations are not enabled, and a 403 when the source image is neither in the Worker's own zone nor listed in `allowed_origins`, matching production. Transforms use the same low-fidelity Sharp-backed mock as `cf.image` fetches, so only resize, rotate, format conversion and a small set of options are applied.

This is a change in behaviour: previously `/cdn-cgi/image/` requests were passed through to your Worker during local development.

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

`cf migrate` carries `images.url_transformations` over to this field. Requests made through `SELF` in `@cloudflare/vitest-plugin` bypass Miniflare's routing and are not intercepted.
