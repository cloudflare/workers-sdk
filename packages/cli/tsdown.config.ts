import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"index.ts",
		"args.ts",
		"colors.ts",
		"command.ts",
		"error.ts",
		"gitignore.ts",
		"interactive.ts",
		"packages.ts",
		"streams.ts",
	],
	platform: "node",
	format: "esm",
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	// Transpile each source file individually without bundling dependencies.
	// This package is always consumed through a downstream bundler (C3,
	// wrangler, miniflare) which handles dependency resolution itself.
	// Bundling CJS deps into ESM creates createRequire(import.meta.url) shims
	// that break when re-bundled as CJS.
	unbundle: true,
});
