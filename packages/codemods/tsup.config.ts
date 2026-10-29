import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		bin: "src/bin.ts",
		index: "src/index.ts",
	},
	// Build both entry points together so their bundled dependencies are shared.
	splitting: true,
	clean: true,
	treeshake: true,
	keepNames: true,
	platform: "node",
	format: "esm",
	outExtension: () => ({ js: ".mjs" }),
	dts: { entry: { index: "src/index.ts" } },
	outDir: "dist",
	tsconfig: "tsconfig.json",
	metafile: true,
	sourcemap: process.env.SOURCEMAPS !== "false",
	// Provide require for bundled CommonJS dependencies, including when a consumer
	// rebundles an entry point and its shared chunks as CommonJS.
	banner: {
		js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url || (typeof __filename === "string" ? __filename : "/"));',
	},
	noExternal: [/.*/],
});
