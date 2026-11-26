# `@cloudflare/config`

The configuration format for Cloudflare Workers and related products. This is a
release candidate for 1.0.

You rarely need to install this package directly. Projects import the helpers
for writing `cloudflare.config.ts` from `cf/config`, which re-exports this
package's public API. Tools that load and validate the config depend on this
package.

Example `cloudflare.config.ts`:

```ts
import { bindings, defineConfig, exports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig((ctx) => ({
	worker: {
		name: "my-worker",
		compatibilityDate: "2026-11-01",
		entrypoint,
		triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
		env: {
			CACHE: bindings.kv(),
			API_TOKEN: bindings.secret(),
			API_ORIGIN: bindings.text(
				ctx.mode === "production"
					? "https://api.example.com"
					: "https://staging.api.example.com"
			),
		},
		exports: {
			Counter: exports.durableObject({ storage: "sqlite" }),
		},
	},
}));
```
