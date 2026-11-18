import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: [
			"src/index.ts",
			"src/wrangler/index.ts",
			"src/cf/index.ts",
			"src/test-helpers/index.ts",
		],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: { neverBundle: ["vitest", "undici", "msw"] },
	},
]);
