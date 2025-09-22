import { defineConfig } from "tsdown";
import type { Options } from "tsdown";

function worker(options: Options): Options {
	return {
		platform: "neutral",
		inputOptions: {
			resolve: {
				mainFields: ["module", "main"],
			},
		},
		dts: false,
		external: ["cloudflare:workers"],
		tsconfig: "tsconfig.worker.json",
		ignoreWatch: "dist",
		...options,
	};
}

export default defineConfig([
	{
		entry: "src/index.ts",
		platform: "node",
		outDir: "dist",
		tsconfig: "tsconfig.plugin.json",
		dts: {
			compilerOptions: {
				// workaround for https://github.com/rolldown/tsdown/issues/345
				paths: {
					"@cloudflare/workers-shared/utils/types": [
						"../workers-shared/utils/types",
					],
				},
			},
		},
	},
	worker({
		entry: "src/asset-workers/router-worker.ts",
		outDir: "dist/asset-workers",
	}),
	worker({
		entry: "src/asset-workers/asset-worker.ts",
		outDir: "dist/asset-workers",
	}),
	worker({
		entry: "src/runner-worker/index.ts",
		outDir: "dist/runner-worker",
		noExternal: ["vite/module-runner"],
	}),
	worker({
		entry: "src/vite-proxy-worker/index.ts",
		outDir: "dist/vite-proxy-worker",
	}),
]);
