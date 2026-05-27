---
"@cloudflare/vite-plugin": minor
---

Add experimental `experimental.newConfig` option to load the entry Worker's configuration from `worker.config.ts`

This is an experimental, opt-in feature. When enabled, the plugin loads the entry Worker's configuration from a `worker.config.ts` file instead of the usual `wrangler.json` / `wrangler.jsonc` / `wrangler.toml`.

Pass `true` to enable with defaults, or an object to customise behaviour. Currently the only sub-option is `types.generate` (defaults to `true`), which writes a `worker-configuration.d.ts` file next to the config that enables typed `env` and `exports` for your Worker.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			experimental: {
				newConfig: true,
			},
		}),
	],
});
```

```ts
// worker.config.ts
import {
	defineWorker,
	bindings,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker((ctx) => ({
	name: "my-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
	env: {
		MY_TEXT: bindings.text(`The mode is ${ctx.mode}`),
		MY_KV: bindings.kv(),
	},
}));
```

A few limitations apply while the feature is experimental:

- `configPath` cannot be combined with `experimental.newConfig`. The entry Worker is always loaded from `worker.config.ts` at the project root.
- `auxiliaryWorkers` are not yet supported alongside `experimental.newConfig`.

Because this is experimental, the option, the `worker.config.ts` schema, and the `@cloudflare/vite-plugin/experimental-config` exports may change in any release.
