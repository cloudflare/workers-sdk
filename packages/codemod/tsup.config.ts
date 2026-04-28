import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: ["src/index.ts"],
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		external: [
			"@cloudflare/*",
			"vitest",
			// Note: recast is external and a peer dependency of the package because `recast` does generally need
			//       to be used directly by this package's consumers, and if it were bundled in this package that
			//       would mean that consumers of this package would get the `recast` code twice significantly
			"recast",
			"recast/parsers/esprima",
			"recast/parsers/typescript",
		],
	},
]);
