---
"miniflare": major
---

Adopt the `@cloudflare/config` worker configuration format

Workers are now configured with a `workers` array of `{ config, legacy, dev }` entries, where `config` follows the shared `@cloudflare/config` output schema (including inline module `manifest`s) rather than the previous flat per-worker options. Service bindings, tail consumers, assets, and source maps are all driven from this format:

- Service bindings support the `external`, `network`, and `disk` designators alongside worker/fetcher/node-handler bindings.
- Tail consumers accept `entrypoint` and `props`.
- Assets expose a `hasUserWorker` flag to control router behaviour.
- Source maps are provided inline as `sourcemap`-type manifest modules.

```js
new Miniflare({
	workers: [
		{
			config: {
				type: "worker",
				name: "my-worker",
				compatibilityDate: "2025-05-01",
				manifest: {
					mainModule: "index.mjs",
					modules: {
						"index.mjs": {
							type: "esm",
							contents: "export default { fetch() {} }",
						},
					},
				},
			},
		},
	],
});
```
