---
"@cloudflare/vite-plugin": minor
---

Add per-Worker `devOnly` option to the plugin config

This determines if the given Worker should be built. It accepts a `boolean` or a function that returns a `boolean`. The function is evaluated lazily at build time, allowing frameworks to provide the value after initialization.

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

Some frameworks, such as Astro, use the `ssr` environment during development but omit it from the build if the app is fully static. In these cases, we now output an assets only version of the user's input Wrangler config to the output config in the client output directory.
