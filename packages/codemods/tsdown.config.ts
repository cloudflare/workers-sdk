import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig({
	entry: {
		bin: "src/bin.ts",
		index: "src/index.ts",
	},
	// Build both entry points together so their bundled dependencies are shared.
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
	deps: { neverBundle: EXTERNAL_DEPENDENCIES },
});
