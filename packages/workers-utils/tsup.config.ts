import { defineConfig } from "tsup";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps";

const declarationOptions = {
	resolve: ["@cloudflare/workers-shared", "jsonc-parser", "zod", /^\./],
	compilerOptions: {
		baseUrl: ".",
		paths: {
			"@cloudflare/workers-shared": ["../workers-shared/index.ts"],
			// tsup 8.3 does not load Zod's default .d.cts entry point. Resolve its
			// published ESM declarations without changing the runtime build.
			zod: ["./node_modules/zod/index.d.ts"],
		},
	},
};

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		// Keep the browser export free of the Node-only banner used below.
		entry: ["src/browser.ts"],
		platform: "node",
		format: "esm",
		dts: declarationOptions,
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
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		format: "esm",
		dts: declarationOptions,
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
