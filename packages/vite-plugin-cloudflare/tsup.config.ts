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
		// We want just a single output file for each asset worker.
		// If we split then we end up with a shared module that is not so easy to load into Miniflare,
		// since we must specify all the modules for each service.
		splitting: false,
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
	{
		entry: ["src/vite-proxy-worker/index.ts"],
		format: "esm",
		platform: "neutral",
		outDir: "dist/vite-proxy-worker",
		external: ["cloudflare:workers"],
		tsconfig: "tsconfig.worker.json",
	},
]);
