import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		// Keep these exports free of the Node-only banner used below: the browser
		// export, and the modules bundled into Workers without nodejs_compat.
		entry: [
			"src/browser.ts",
			"src/prometheus-metrics.ts",
			"src/apply-d1-migrations.ts",
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
	{
		treeshake: true,
		keepNames: true,
		entry: [
			"src/index.ts",
			"src/test-helpers/index.ts",
			// Leaf entry points let consumers bundle individual utilities without
			// pulling in the broad package barrel and its transitive dependencies.
			"src/compliance.ts",
			"src/compatibility-date.ts",
			"src/docker-path.ts",
			"src/errors.ts",
			"src/custom-api-headers.ts",
			"src/d1-migrations.ts",
			"src/sanitize-headers.ts",
			"src/fs-helpers.ts",
			"src/global-wrangler-config-path.ts",
			"src/local-env.ts",
			"src/node-compat.ts",
			"src/sourcemap.ts",
			"src/zod-format.ts",
		],
		platform: "node",
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
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
