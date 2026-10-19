import { defineConfig } from "tsdown";
import type { UserConfig } from "tsdown";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		platform: "node",
		outDir: "dist",
		// Dependencies, whose types the declarations import rather than inline.
		external: ["miniflare", "@cloudflare/config"],
		dts: {
			// `@cloudflare/workers-dev-shared` is private, so inline its types.
			resolve: ["@cloudflare/workers-dev-shared"],
		},
		tsconfig: "tsconfig.json",
	},
	// The router and asset Workers that serve assets in dev (see
	// `getDevAssetWorkerOptions()`), shared with `@cloudflare/vite-plugin`.
	internalWorker("asset-worker"),
	internalWorker("router-worker"),
]);

function internalWorker(name: string): UserConfig {
	return {
		entry: { index: `../workers-dev-shared/src/workers/${name}/index.ts` },
		outDir: `dist/workers/${name}`,
		platform: "neutral",
		inputOptions: { resolve: { mainFields: ["module", "main"] } },
		dts: false,
		external: ["cloudflare:workers"],
		tsconfig: "../workers-dev-shared/tsconfig.worker.json",
	};
}
