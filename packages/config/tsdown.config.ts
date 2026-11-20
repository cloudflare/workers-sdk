import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
			public: "src/public.ts",
		},
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		outDir: "dist",
		dts: false,
		tsconfig: "tsconfig.json",
		// Keep zod external so consumers that bundle this package (wrangler,
		// deploy-helpers, vite-plugin) share a single zod copy instead of inlining
		// one per consumed entry point.
		deps: {
			neverBundle: [/^zod(\/.*)?$/],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/config/src/index.d.ts",
			public: "emitted-types/packages/config/src/public.d.ts",
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
			neverBundle: [/^zod(\/.*)?$/],
		},
	},
]);
