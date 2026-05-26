---
"@cloudflare/vite-plugin": minor
---

Add `assetsOnly` (entry Worker) and `devOnly` (auxiliary Workers) options to the plugin config

Both options accept a `boolean` or a function that returns a `boolean`. The function is evaluated lazily at build time, allowing frameworks to provide the value after initialization.

Use `assetsOnly` on the entry Worker to skip building the Worker and instead emit an assets-only Wrangler config to the client output directory. This enables frameworks such as Astro to use the `ssr` environment during development but produce a fully static app for deployment.

```ts
export default defineConfig({
	plugins: [
		cloudflare({
			assetsOnly: () => isStaticBuild,
		}),
	],
});
```

Use `devOnly` on an auxiliary Worker to include it during `vite dev` but skip it at build time.

```ts
export default defineConfig({
	plugins: [
		cloudflare({
			auxiliaryWorkers: [
				{ configPath: "./dev-only-worker/wrangler.jsonc", devOnly: true },
			],
		}),
	],
});
```
