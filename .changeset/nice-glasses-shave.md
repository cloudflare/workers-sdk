---
"@cloudflare/vite-plugin": minor
---

Allow Worker config to be customized in the plugin config

The Vite plugin can now be used to generate a Worker configuration instead of needing a Wrangler config file, or to customize an existing user-provided configuration.

This is done via a new `config` option on the plugin, which accepts either a partial Worker configuration object, or a function that receives the current configuration and returns a partial config object, or modifies the current config in place.

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
