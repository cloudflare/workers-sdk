import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		// Keep the browser export free of the Node-only banner used below.
		entry: ["src/browser.ts"],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		clean: !process.argv.includes("--watch"),
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: {
			neverBundle: [
				/^@cloudflare\/(?!workflows-shared(?:\/|$))/,
				"vitest",
				...EXTERNAL_DEPENDENCIES,
			],
		},
	},
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		entry: [
			"src/index.ts",
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
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		format: "esm",
		clean: !process.argv.includes("--watch"),
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: {
			neverBundle: [
				/^@cloudflare\/(?!workflows-shared(?:\/|$))/,
				"vitest",
				...EXTERNAL_DEPENDENCIES,
			],
		},
	},
	{
		entry: {
			browser: "emitted-types/packages/workers-utils/src/browser.d.ts",
			index: "emitted-types/packages/workers-utils/src/index.d.ts",
			"prometheus-metrics":
				"emitted-types/packages/workers-utils/src/prometheus-metrics.d.ts",
			"test-helpers/index":
				"emitted-types/packages/workers-utils/src/test-helpers/index.d.ts",
			compliance: "emitted-types/packages/workers-utils/src/compliance.d.ts",
			"compatibility-date":
				"emitted-types/packages/workers-utils/src/compatibility-date.d.ts",
			"docker-path":
				"emitted-types/packages/workers-utils/src/docker-path.d.ts",
			errors: "emitted-types/packages/workers-utils/src/errors.d.ts",
			"fs-helpers": "emitted-types/packages/workers-utils/src/fs-helpers.d.ts",
			"global-wrangler-config-path":
				"emitted-types/packages/workers-utils/src/global-wrangler-config-path.d.ts",
			"local-env": "emitted-types/packages/workers-utils/src/local-env.d.ts",
			"zod-format": "emitted-types/packages/workers-utils/src/zod-format.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "dist",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		outputOptions: {
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		deps: {
			neverBundle: [
				/^@cloudflare\/(?!workflows-shared(?:\/|$))/,
				"vitest",
				...EXTERNAL_DEPENDENCIES,
			],
		},
	},
]);
