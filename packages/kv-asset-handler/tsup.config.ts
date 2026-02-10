import { defineConfig } from "tsup";

export default defineConfig(() => [
	{
		clean: true,
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
	},
]);
