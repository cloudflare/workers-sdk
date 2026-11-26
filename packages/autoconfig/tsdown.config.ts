import { defineConfig } from "tsdown";
import { EXTERNAL_DEPENDENCIES } from "./scripts/deps.ts";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
			// The in-memory converter, without the rest of autoconfig
			"wrangler-to-cf": "src/wrangler-to-cf/convert.ts",
		},
		platform: "node",
		outputOptions: { keepNames: true },
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		shims: true,
		format: "esm",
		outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		define: {
			"process.env.NODE_ENV": `'${"production"}'`,
		},
		deps: { neverBundle: EXTERNAL_DEPENDENCIES },
	},
]);
