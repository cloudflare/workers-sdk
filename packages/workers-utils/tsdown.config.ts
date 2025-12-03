import { defineConfig } from "tsdown";

export default defineConfig([
	{
		treeshake: true,
		entry: ["src/index.ts", "src/browser.ts", "src/test-helpers/index.ts"],
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		external: [/@cloudflare\/.*/, "vitest", "msw", "undici"],
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		inputOptions: {
			// This is required to support jsonc-parser. See https://github.com/microsoft/node-jsonc-parser/issues/57
			resolve: {
				mainFields: ["module", "main"],
			},
		},
	},
]);
