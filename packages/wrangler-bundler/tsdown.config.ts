import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "src/index.ts",
	platform: "node",
	format: "esm",
	outDir: "dist",
	target: "node22",
	dts: true,
	clean: true,
	sourcemap: process.env.NODE_ENV !== "production",
	minify: process.env.NODE_ENV === "production",
	external: ["wrangler"],
});
