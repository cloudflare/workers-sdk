import { defineConfig } from "tsdown";

export default defineConfig([
	{
		treeshake: true,
		// keepNames: true,
		entry: ["src/index.ts", "src/browser.ts", "src/test-helpers/index.ts"],
		platform: "node",
		format: "esm",
		dts: {
			resolve: [/^@cloudflare\//],
			compilerOptions: {
				// workaround for https://github.com/rolldown/tsdown/issues/345
				paths: {
					"@cloudflare/workers-shared": ["../workers-shared"],
				},
			},
		},
		outDir: "dist",
		tsconfig: "tsconfig.json",
		// metafile: true,
		external: ["@cloudflare/*", "vitest", "msw", "undici"],
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
