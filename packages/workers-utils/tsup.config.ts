import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		treeshake: true,
		keepNames: true,
		entry: ["src/index.ts", "src/browser.ts"],
		platform: "node",
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		metafile: true,
		sourcemap: process.env.SOURCEMAPS !== "false",
		// mainFields: ["module", "main"],
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
	},
]);
