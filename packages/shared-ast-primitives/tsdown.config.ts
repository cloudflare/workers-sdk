import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";

export default defineConfig([
	{
		treeshake: true,
		outputOptions: { keepNames: true },
		entry: ["src/index.ts"],
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		// Provide require for bundled CommonJS dependencies. The __filename
		// fallback keeps the output working when it is rebundled to CommonJS.
		banner: {
			js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
		},
		format: "esm",
		dts: false,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: {
			neverBundle: [
				/^@cloudflare\//,
				"vitest",
				// Note: recast is external and a peer dependency of the package because `recast` does generally need
				//       to be used directly by this package's consumers, and if it were bundled in this package that
				//       would mean that consumers of this package would get the `recast` code twice significantly
				"recast",
				"recast/parsers/esprima",
				"recast/parsers/typescript",
			],
		},
	},
	{
		entry: {
			index: "emitted-types/packages/shared-ast-primitives/src/index.d.ts",
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
			neverBundle: [
				/^@cloudflare\//,
				"vitest",
				// Note: recast is external and a peer dependency of the package because `recast` does generally need
				//       to be used directly by this package's consumers, and if it were bundled in this package that
				//       would mean that consumers of this package would get the `recast` code twice significantly
				"recast",
				"recast/parsers/esprima",
				"recast/parsers/typescript",
			],
		},
	},
]);
