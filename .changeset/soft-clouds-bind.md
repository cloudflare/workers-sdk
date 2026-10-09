---
"@cloudflare/config": minor
---

Allow Worker bindings to be included conditionally

Binding entries set to `false`, `null`, or `undefined` are now omitted from `env`. Generated environment types make conditionally included bindings optional.

```ts
export default defineConfig(({ mode }) => ({
	worker: {
		name: "my-worker",
		compatibilityDate: "2026-10-09",
		env: {
			PRODUCTION_KV:
				mode === "production" && bindings.kv({ id: "production-kv-id" }),
			STAGING_API_ORIGIN:
				mode === "staging"
					? bindings.text("https://staging.example.com")
					: undefined,
		},
	},
}));
```
