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
	unbundle: true,
});
