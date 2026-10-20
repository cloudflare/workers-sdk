import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		outDir: "dist",
		dts: false,
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		// esbuild is invoked at runtime to compile user code; it ships
		// platform-specific binaries and must be resolved from the consumer's
		// node_modules at install time — not inlined into our bundle.
		deps: {
			neverBundle: ["esbuild"],
		},
	},
	{
		entry: { cli: "src/cli.ts" },
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		format: "esm",
		outDir: "dist",
		dts: false,
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		deps: {
			neverBundle: ["esbuild"],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/pages-functions/src/index.d.ts",
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
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		deps: {
			neverBundle: ["esbuild"],
		},
	},
]);
