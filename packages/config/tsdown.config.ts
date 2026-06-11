import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		public: "src/public.ts",
		cf: "src/cf.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
});
