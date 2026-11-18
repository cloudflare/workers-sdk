import { defineConfig } from "tsdown";
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
			dts: {
				alwaysBundle: [
					/^@cloudflare\//,
					/^cloudflare(?:\/.*)?$/,
					"jsonc-parser",
					"zod",
				],
			},
		},
		dts: {
			resolver: "tsc",
			compilerOptions: {
				paths: {
					"@cloudflare/workers-shared/utils/types": [
						"../workers-shared/utils/types",
					],
				},
			},
		},
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
			dts: {
				alwaysBundle: [
					/^@cloudflare\//,
					/^cloudflare(?:\/.*)?$/,
					"jsonc-parser",
					"zod",
				],
			},
		},
		dts: {
			resolver: "tsc",
			compilerOptions: {
				paths: {
					"@cloudflare/workers-shared/utils/types": [
						"../workers-shared/utils/types",
					],
				},
			},
		},
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
]);
