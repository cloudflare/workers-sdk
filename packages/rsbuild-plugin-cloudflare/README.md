# `@cloudflare/rsbuild-plugin`

> [!WARNING]
> This is an experimental prototype. It is not published.

Runs your Worker in workerd during `rsbuild dev` and `rsbuild preview`, and writes Cloudflare Build Output from `rsbuild build`.

```ts
// rsbuild.config.ts
import { pluginCloudflare } from "@cloudflare/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	plugins: [pluginCloudflare()],
});
```

The plugin takes the same options as `cloudflare()` from `@cloudflare/vite-plugin`, except `tunnel` and `viteEnvironment`, plus `envDir` and `envMode` for loading `.env` files. It shares its configuration, bindings, assets, Node.js compatibility and Build Output handling with the Vite plugin through `@cloudflare/workers-dev-shared`, and keeps only the Rsbuild glue itself.

Each Worker is bundled in its own Rsbuild environment (`cloudflare` for the entry Worker), and the user's environments are the client.

## Not supported

- Hot module replacement inside the Worker. Changes to the Worker rebuild it and update workerd.
- Containers.
- Prerendering.
- The tunnel, CLI shortcuts and `cf` CLI integration.

## Tests

Besides this package's unit tests, the Vite plugin's playground suite runs against this plugin:

```sh
pnpm --filter @vite-plugin-cloudflare/playground test:ci:rsbuild:serve
pnpm --filter @vite-plugin-cloudflare/playground test:ci:rsbuild:build
```

See `packages/vite-plugin-cloudflare/playground/vitest.config.e2e.rsbuild.ts` for the playgrounds and tests that are skipped, and why.

So does the Vite plugin's e2e suite, which installs fixtures from a mock npm registry:

```sh
pnpm turbo test:e2e:rsbuild -F @cloudflare/vite-plugin
```

See `packages/vite-plugin-cloudflare/e2e/vitest.config.rsbuild.ts` for the tests that are skipped.
