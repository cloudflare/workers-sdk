import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	platform: "node",
	inputOptions: { resolve: { mainFields: ["module", "main"] } },
	format: ["esm"],
	dts: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	// This is a `type: module` package whose entry point is published as
	// `.js`/`.d.ts` (not tsdown's default `.mjs`/`.d.mts`).
	outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
	sourcemap: process.env.SOURCEMAPS !== "false",
	define: {
		"process.env.NODE_ENV": `'${"production"}'`,
	},
});
