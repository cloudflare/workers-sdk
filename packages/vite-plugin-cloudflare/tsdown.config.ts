import { defineConfig } from "tsdown";
import type { UserConfig } from "tsdown";

const ignoreWatch = ["dist", "playground", "e2e"];

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
		ignoreWatch,
	},
	worker("asset-worker"),
	worker("router-worker"),
	worker("runner-worker", { noExternal: ["vite/module-runner"] }),
	worker("vite-proxy-worker"),
]);

/**
 * Helper function to create the config for bundling a Worker
 */
function worker(name: string, options: UserConfig = {}): UserConfig {
	return {
		entry: { [name]: `src/workers/${name}/index.ts` },
		outDir: "dist/workers",
		platform: "neutral",
		inputOptions: {
			resolve: {
				mainFields: ["module", "main"],
			},
		},
		dts: false,
		external: ["cloudflare:workers"],
		tsconfig: "tsconfig.worker.json",
		ignoreWatch,
		...options,
	};
}
