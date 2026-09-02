import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: [
			"src/index.ts",
			"src/browser.ts",
			"src/prometheus-metrics.ts",
			"src/test-helpers/index.ts",
			// Leaf entry points let consumers bundle individual utilities without
			// pulling in the broad package barrel and its transitive dependencies.
			"src/compliance.ts",
			"src/compatibility-date.ts",
			"src/docker-path.ts",
			"src/errors.ts",
			"src/fs-helpers.ts",
			"src/global-wrangler-config-path.ts",
			"src/local-env.ts",
			"src/zod-format.ts",
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
		external: ["@cloudflare/*", "vitest", ...EXTERNAL_DEPENDENCIES],
	},
]);
