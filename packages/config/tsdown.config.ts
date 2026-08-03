import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		public: "src/public.ts",
	},
	platform: "node",
	outDir: "dist",
	dts: true,
	tsconfig: "tsconfig.json",
	// Keep zod external so consumers that bundle this package (wrangler,
	// deploy-helpers, vite-plugin) share a single zod copy instead of inlining
	// one per consumed entry point.
	external: [/^zod(\/.*)?$/],
});
