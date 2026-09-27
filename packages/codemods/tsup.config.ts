import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: ["src/bin.ts"],
		platform: "node",
		format: "esm",
		outExtension: () => ({ js: ".mjs" }),
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		noExternal: [/.*/],
	},
	{
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
		},
		dts: true,
		entry: {
			index: "src/index.ts",
		},
		format: "esm",
		keepNames: true,
		metafile: true,
		noExternal: [/.*/],
		outDir: "dist",
		outExtension: () => ({ js: ".mjs" }),
		platform: "node",
		sourcemap: process.env.SOURCEMAPS !== "false",
		treeshake: true,
		tsconfig: "tsconfig.json",
	},
]);
