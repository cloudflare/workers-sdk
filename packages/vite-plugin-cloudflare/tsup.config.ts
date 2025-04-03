import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: "esm",
		platform: "node",
		dts: true,
		outDir: "dist",
		tsconfig: "tsconfig.plugin.json",
	},
	{
		entry: [
			"src/asset-workers/router-worker.ts",
			"src/asset-workers/asset-worker.ts",
		],
		format: "esm",
		platform: "neutral",
		outDir: "dist/asset-workers",
		external: ["cloudflare:workers"],
		tsconfig: "tsconfig.worker.json",
	},
	{
		entry: ["src/runner-worker/index.ts"],
		format: "esm",
		platform: "neutral",
		outDir: "dist/runner-worker",
		external: ["cloudflare:workers"],
		noExternal: ["vite/module-runner"],
		tsconfig: "tsconfig.worker.json",
	},
]);
