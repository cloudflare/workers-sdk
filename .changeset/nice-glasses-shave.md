---
"@cloudflare/vite-plugin": minor
---

Allow plugin to customize the worker config

The Vite plugin can now be used to generate a worker configuration instead of needing a wrangler config file, or to customize an existing user-provided configuration.

This is done via a new `config` option on the plugin, which accepts either a partial worker configuration object, or a function that receives the current configuration and returns a partial modified config object, or modifies the current config in place.

```ts
import cloudflare from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Define a partial config object

export default defineConfig({
	plugins: [
		cloudflare({
			config: {
				compatibility_date: "2025-01-01",
			},
		}),
	],
});

// Return a partial config from a function, conditional on some logic
export default defineConfig({
	plugins: [
		cloudflare({
			config: (workerConfig) => {
				if (workerConfig.name === "my-worker") {
					return {
						compatibility_flags: ["nodejs_compat"],
					};
				}
			},
		}),
	],
});

// Modify the config in place

export default defineConfig({
	plugins: [
		cloudflare({
			config: (workerConfig) => {
				workerConfig.compatibility_date = "2025-01-01";
			},
		}),
	],
});
```
