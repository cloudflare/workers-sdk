import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	platform: "node",
	format: "esm",
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	external: ["esbuild"],
	inputOptions: {
		resolve: {
			mainFields: ["module", "main"],
		},
	},

	define: {
		"process.env.NODE_ENV": `'${"production"}'`,
	},
});
