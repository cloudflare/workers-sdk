import { defineConfig } from "tsdown";
import type { UserConfig } from "tsdown";

const ignoreWatch = ["dist", "playground", "e2e"];
const sourcemap = process.env.SOURCEMAPS !== "false";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		platform: "node",
		sourcemap,
		outDir: "dist",
		tsconfig: "tsconfig.plugin.json",
		dts: {
			sourcemap,
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
	{
		// `cf-vite` delegate-binary entry. Bundled separately from the
		// plugin itself so the bin shim (`bin/cf-vite`) can
		// dynamic-import it without dragging the plugin's type-export
		// overhead. The entry exposes a small subcommand-based CLI
		// (currently just `dev`) that any parent process can spawn
		// (see `src/cf-vite.ts` for the protocol).
		entry: "src/cf-vite.ts",
		platform: "node",
		sourcemap,
		outDir: "dist",
		tsconfig: "tsconfig.plugin.json",
		dts: false,
		ignoreWatch,
	},
	worker("asset-worker"),
	worker("router-worker"),
	worker("runner-worker", {
		entry: {
			index: "src/workers/runner-worker/index.ts",
			"module-runner": "vite/module-runner",
			"module-runner-legacy": "vite-legacy/module-runner",
		},
		external: ["cloudflare:workers", "vite/module-runner"],
	}),
	worker("vite-proxy-worker"),
]);

/**
 * Helper function to create the config for bundling a Worker
 */
function worker(name: string, options: UserConfig = {}): UserConfig {
	return {
		entry: { index: `src/workers/${name}/index.ts` },
		outDir: `dist/workers/${name}`,
		platform: "neutral",
		sourcemap,
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
