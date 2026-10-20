import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: "esm",
		dts: false,
		outExtensions: () => ({ js: ".mjs", dts: ".d.ts" }),
	},
	{
		entry: ["src/runtime/**/*.ts"],
		outDir: "dist/runtime",
		format: "esm",
		unbundle: true,
		dts: false,
		outputOptions: { preserveModulesRoot: "src/runtime" },
	},
	{
		entry: {
			index: "emitted-types/packages/unenv-preset/src/index.d.ts",
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
	},
	{
		entry: {
			"node/console":
				"emitted-types/packages/unenv-preset/src/runtime/node/console.d.ts",
			"node/process":
				"emitted-types/packages/unenv-preset/src/runtime/node/process.d.ts",
			"polyfill/performance":
				"emitted-types/packages/unenv-preset/src/runtime/polyfill/performance.d.ts",
		},
		outDir: "dist/runtime",
		format: "esm",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},

		tsconfig: "tsconfig.declarations.json",
		plugins: [emitDeclarations()],
		outputOptions: {
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
	},
]);
