import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
});
