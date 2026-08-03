import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: [
			"src/index.ts",
			"src/browser.ts",
			"src/prometheus-metrics.ts",
			"src/test-helpers/index.ts",
			// Leaf entry points that only depend on Node.js builtins, so they can
			// be imported by packages bundling to ESM (e.g. via Vite) without
			// pulling in the barrel's CommonJS dependencies.
			"src/fs-helpers.ts",
			"src/global-wrangler-config-path.ts",
		],
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		external: ["@cloudflare/*", "vitest", "undici"],
	},
]);
