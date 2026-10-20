import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		entry: ["src/index.ts"],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		fixedExtension: false,
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
	{
		entry: {
			index: "emitted-types/packages/kv-asset-handler/src/index.d.ts",
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
		fixedExtension: false,
	},
]);
