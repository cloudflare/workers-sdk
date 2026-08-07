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
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
		},
		noExternal: [/.*/],
	},
]);
