import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/public.ts"],
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
});
