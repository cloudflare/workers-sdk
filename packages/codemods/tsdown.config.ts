import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		entry: {
			bin: "src/bin.ts",
			index: "src/index.ts",
		},
		// Build both entry points together so their bundled dependencies are shared.
		clean: true,
		treeshake: true,
		outputOptions: { keepNames: true },
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		outExtensions: () => ({ js: ".mjs", dts: ".d.ts" }),
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		// Provide require for bundled CommonJS dependencies, including when a consumer
		// rebundles an entry point and its shared chunks as CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		deps: {
			alwaysBundle: [/.*/],
		},
	},
	{
		entry: {
			bin: "emitted-types/packages/codemods/src/bin.d.ts",
			index: "emitted-types/packages/codemods/src/index.d.ts",
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
			entryFileNames: "[name].d.ts",
			chunkFileNames: "[name]-[hash].d.ts",
		},
		tsconfig: "tsconfig.declarations.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		outExtensions: () => ({ dts: ".d.ts" }),
		deps: {
			alwaysBundle: [/.*/],
		},
	},
]);
