import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig([
	{
		// Keep these exports free of Node.js shims: the browser
		// export, and the metrics registry bundled into Workers without nodejs_compat.
		entry: ["src/browser.ts", "src/prometheus-metrics.ts"],
		clean: true,
		platform: "node",
		outputOptions: { keepNames: true },
		format: "esm",
		deps: {
			neverBundle: ["vitest", ...EXTERNAL_DEPENDENCIES],
		},
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
	{
		clean: false,
		entry: [
			"src/index.ts",
			"src/config/public.ts",
			"src/asset-hash.ts",
			"src/test-helpers/index.ts",
			// Leaf entry points let consumers bundle individual utilities without
			// pulling in the broad package barrel and its transitive dependencies.
			"src/compliance.ts",
			"src/compatibility-date.ts",
			"src/docker-path.ts",
			"src/errors.ts",
			"src/custom-api-headers.ts",
			"src/sanitize-headers.ts",
			"src/fs-helpers.ts",
			"src/global-wrangler-config-path.ts",
			"src/local-env.ts",
			"src/node-compat.ts",
			"src/sourcemap.ts",
			"src/zod-format.ts",
		],
		platform: "node",
		outputOptions: { keepNames: true },
		shims: true,
		format: "esm",
		deps: {
			// Asset configuration uses private workspace utilities at runtime.
			alwaysBundle: [/^@cloudflare\/workers-shared(\/.*)?$/],
			neverBundle: ["vitest", ...EXTERNAL_DEPENDENCIES],
		},
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
	{
		entry: {
			browser: "emitted-types/packages/workers-utils/src/browser.d.ts",
			"prometheus-metrics":
				"emitted-types/packages/workers-utils/src/prometheus-metrics.d.ts",
			index: "emitted-types/packages/workers-utils/src/index.d.ts",
			"config/public":
				"emitted-types/packages/workers-utils/src/config/public.d.ts",
			"asset-hash": "emitted-types/packages/workers-utils/src/asset-hash.d.ts",
			"test-helpers/index":
				"emitted-types/packages/workers-utils/src/test-helpers/index.d.ts",
			compliance: "emitted-types/packages/workers-utils/src/compliance.d.ts",
			"compatibility-date":
				"emitted-types/packages/workers-utils/src/compatibility-date.d.ts",
			"docker-path":
				"emitted-types/packages/workers-utils/src/docker-path.d.ts",
			errors: "emitted-types/packages/workers-utils/src/errors.d.ts",
			"custom-api-headers":
				"emitted-types/packages/workers-utils/src/custom-api-headers.d.ts",
			"sanitize-headers":
				"emitted-types/packages/workers-utils/src/sanitize-headers.d.ts",
			"fs-helpers": "emitted-types/packages/workers-utils/src/fs-helpers.d.ts",
			"global-wrangler-config-path":
				"emitted-types/packages/workers-utils/src/global-wrangler-config-path.d.ts",
			"local-env": "emitted-types/packages/workers-utils/src/local-env.d.ts",
			"node-compat":
				"emitted-types/packages/workers-utils/src/node-compat.d.ts",
			sourcemap: "emitted-types/packages/workers-utils/src/sourcemap.d.ts",
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
			neverBundle: ["vitest", ...EXTERNAL_DEPENDENCIES],
			alwaysBundle: [
				/^@cloudflare\//,
				/^cloudflare(?:\/.*)?$/,
				"jsonc-parser",
				"zod",
			],
		},
	},
]);
