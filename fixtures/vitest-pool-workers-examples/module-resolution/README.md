# ⚡ module-resolution

This fixture demonstrates that the Vitest integration correctly resolves modules, including:

- A CommonJS package that requires a directory rather than a specific file.
- A package without a main entrypoint or with browser field mapping, handled via [Dependency Pre-Bundling](#dependency-pre-bundling).

## Dependency Pre-Bundling

[Dependency Pre-Bundling](https://vite.dev/guide/dep-pre-bundling) is a Vite feature that converts dependencies shipped as CommonJS or UMD into ESM. If you encounter module resolution issues—such as: `Error: Cannot use require() to import an ES Module` or `Error: No such module`—you can pre-bundle these dependencies using the [deps.optimizer](https://vitest.dev/config/#deps-optimizer) option:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		deps: {
			optimizer: {
				ssr: {
					enabled: true,
					include: ["your-package-name"],
				},
			},
		},
		poolOptions: {
			workers: {
				// ...
			},
		},
	},
});
```

See our [vitest config](./vitest.config.ts) for an example of how we pre-bundled `discord-api-types/v10` and `@microlabs/otel-cf-workers`.
