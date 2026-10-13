---
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"miniflare": minor
---

Support Cloudflare Access local development configuration in `cloudflare.config.ts`

Workers can now configure an Access audience and mock identity under `access.dev`, and `cf migrate` preserves this setting when converting a Wrangler configuration. Miniflare v5 now reads the setting from `config.access.dev`, aligning its Worker configuration with `@cloudflare/config`; the Miniflare v4 compatibility adapter continues to accept its existing `access` option.

```ts
export default defineConfig({
	worker: {
		name: "api",
		access: {
			dev: {
				aud: "my-access-audience",
				identity: { email: "developer@example.com" },
			},
		},
	},
});
```
