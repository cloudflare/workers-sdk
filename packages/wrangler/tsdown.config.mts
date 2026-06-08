import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		"experimental-config": "src/experimental-config.ts",
	},
	platform: "node",
	outDir: "wrangler-dist",
	clean: false,
	tsconfig: "tsconfig.experimental-config.json",
	dts: {
		resolve: ["@cloudflare/config"],
	},
});
