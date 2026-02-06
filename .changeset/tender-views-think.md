---
"@cloudflare/vite-plugin": minor
---

Infer `upload_source_maps` setting in the output Worker config from the `build.sourcemap` setting in the Vite config.

If [build.sourcemap](https://vite.dev/config/build-options#build-sourcemap) is enabled for a Worker environment, as in the following example, `"upload_source_maps": true` will now automatically be added to the output `wrangler.json` file.
This removes the need to additionally specify the `upload_source_maps` property in the input Worker config.

```ts
export default defineConfig({
	environments: {
		my_worker: {
			build: {
				sourcemap: true,
			},
		},
	},
	plugins: [cloudflare()],
});
```

Note that if `upload_source_maps` is set in the input Worker config, this value will take precedence.
This makes it possible to generate source maps without uploading them.
