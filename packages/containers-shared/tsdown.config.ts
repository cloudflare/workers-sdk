import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		entry: {
			index: "index.ts",
		},
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		// Bundled ws uses CommonJS imports for Node builtins. Miniflare bundles
		// this package into CJS, where import.meta.url is unavailable.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		format: "esm",
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		deps: {
			neverBundle: [/^@cloudflare\//, ...EXTERNAL_DEPENDENCIES],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/containers-shared/index.d.ts",
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
		tsconfig: "tsconfig.declarations.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		deps: {
			neverBundle: [/^@cloudflare\//, ...EXTERNAL_DEPENDENCIES],
		},
	},
]);
