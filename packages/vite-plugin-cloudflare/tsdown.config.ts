import { defineConfig } from "tsdown";
import { emitDeclarations } from "../../tools/build/declarations.mjs";
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
		deps: { neverBundle: ["cloudflare:workers", "vite/module-runner"] },
	}),
	worker("vite-proxy-worker"),
	{
		entry: {
			index: "emitted-types/packages/vite-plugin-cloudflare/src/index.d.ts",
		},
		platform: "node",
		format: "esm",
		outDir: "dist",
		clean: false,
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		outputOptions: {
			entryFileNames: "[name].d.mts",
			chunkFileNames: "[name]-[hash].d.mts",
		},
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		plugins: [emitDeclarations()],
		deps: {
			alwaysBundle: [
				/^@cloudflare\/(?!workers-types(?:\/|$))/,
				/^cloudflare(?:\/.*)?$/,
				"jsonc-parser",
				"zod",
			],
		},
	},
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
		deps: { neverBundle: ["cloudflare:workers"] },
		tsconfig: "tsconfig.worker.json",
		ignoreWatch,
		...options,
	};
}
