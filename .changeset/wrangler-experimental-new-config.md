---
"wrangler": minor
---

Add experimental `--x-new-config` flag for authoring config in TypeScript

This is an experimental, opt-in feature. When enabled, `wrangler dev`, `wrangler build`, `wrangler deploy`, `wrangler versions upload`, and `wrangler versions deploy` load the Worker's configuration from a `cloudflare.config.ts` file instead of `wrangler.json` / `wrangler.jsonc` / `wrangler.toml`. Additionally, an optional `wrangler.config.ts` file can be provided for Wrangler-specific dev/build configuration.

- **`cloudflare.config.ts`** (required) — Worker runtime configuration (bindings, triggers, observability, placement, limits, compatibility, routes, etc.). Authored via `defineWorker` from `wrangler/experimental-config`.
- **`wrangler.config.ts`** (optional) — Tooling / bundling / dev-server configuration (`noBundle`, `minify`, `alias`, `define`, `rules`, `tsconfig`, `build`, `dev`, `assetsDirectory`, etc.). Authored via `defineWranglerConfig` from `wrangler/experimental-config`.

Per-environment configuration is via `ctx.mode` branching inside the function form of either file.

Example `cloudflare.config.ts`:

```ts
import { defineWorker, bindings } from "wrangler/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker((ctx) => ({
	name: "my-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
	env: {
		MY_KV: bindings.kv(),
		MY_TEXT: bindings.text(`The mode is ${ctx.mode}`),
	},
}));
```

Example `wrangler.config.ts`:

```ts
import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	minify: true,
	assetsDirectory: "./public",
});
```

Because this is experimental, the flag, the config formats, and the `wrangler/experimental-config` exports may change in any release.
