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
		external: ["jsonc-parser", "@cloudflare/*", "vitest", "msw", "undici"],
		sourcemap: process.env.SOURCEMAPS !== "false",
		// mainFields: ["module", "main"],
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
]);
