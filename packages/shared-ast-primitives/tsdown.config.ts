import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		platform: "node",
		outputOptions: { keepNames: true },
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: {
			neverBundle: [
				"vitest",
				// Note: recast is external and a peer dependency of the package because `recast` does generally need
				//       to be used directly by this package's consumers, and if it were bundled in this package that
				//       would mean that consumers of this package would get the `recast` code twice significantly
				"recast",
				"recast/parsers/babel",
				"recast/parsers/typescript",
			],
		},
	},
]);
