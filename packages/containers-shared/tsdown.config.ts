import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig([
	{
		clean: true,
		entry: {
			index: "index.ts",
		},
		platform: "node",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		deps: { neverBundle: EXTERNAL_DEPENDENCIES },
	},
]);
