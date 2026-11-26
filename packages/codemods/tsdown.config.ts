import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		bin: "src/bin.ts",
		index: "src/index.ts",
		"wrangler-to-cf": "src/wrangler-to-cf.ts",
	},
	// Build the entry points together so their bundled dependencies are shared.
	clean: true,
	platform: "node",
	outputOptions: { keepNames: true },
	inputOptions: { resolve: { mainFields: ["module", "main"] } },
	format: "esm",
	outExtensions: () => ({ js: ".mjs", dts: ".d.ts" }),
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	shims: true,
	deps: { alwaysBundle: [/.*/] },
});
