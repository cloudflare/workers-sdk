import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		entry: [
			"src/index.ts",
			"src/wrangler/index.ts",
			"src/cf/index.ts",
			"src/test-helpers/index.ts",
		],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: {
			neverBundle: ["vitest", "undici", "msw"],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/workers-auth/src/index.d.ts",
			"wrangler/index":
				"emitted-types/packages/workers-auth/src/wrangler/index.d.ts",
			"cf/index": "emitted-types/packages/workers-auth/src/cf/index.d.ts",
			"test-helpers/index":
				"emitted-types/packages/workers-auth/src/test-helpers/index.d.ts",
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
			neverBundle: [/^@cloudflare\//, "vitest", "undici", "msw"],
		},
	},
]);
