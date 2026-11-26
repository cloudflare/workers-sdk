import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";
import type { UserConfig } from "tsdown";

const commonOptions: UserConfig = {
	platform: "node",
	format: "esm",
	outputOptions: { keepNames: true },
	inputOptions: { resolve: { mainFields: ["module", "main"] } },
	shims: true,
	outDir: "dist",
	tsconfig: "tsconfig.json",
	sourcemap: process.env.SOURCEMAPS !== "false",
	deps: { neverBundle: EXTERNAL_DEPENDENCIES },
};

export default defineConfig([
	{
		...commonOptions,
		entry: {
			"dev-vars": "src/dev-vars.ts",
			"miniflare-options": "src/miniflare-options.ts",
			"pages-assets": "src/pages-assets.ts",
		},
		dts: false,
	},
	{
		...commonOptions,
		clean: false,
		// Pages assets use Workers globals, so emit the Node-facing declaration
		// checked against the implementation in type-tests/pages-assets.ts.
		entry: {
			"dev-vars": "src/dev-vars.ts",
			"miniflare-options": "src/miniflare-options.ts",
			"pages-assets": "src/pages-assets-types.ts",
		},
		dts: { emitDtsOnly: true, resolver: "tsc" },
	},
]);
