import assert from "node:assert";
import { detectModuleType, writeOutputWorkerConfig } from "../build-output";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { createPlugin } from "../utils";
import type { ModuleType } from "@cloudflare/config";

/**
 * Build Output API plugin. Replaces `outputConfigPlugin` when
 * `experimental.newConfig.cfBuildOutput` is set.
 */
export const buildOutputPlugin = createPlugin("build-output", (ctx) => {
	return {
		writeBundle(_options, bundle) {
			if (ctx.isChildEnvironment(this.environment.name)) {
				return;
			}

			if (
				ctx.resolvedPluginConfig.type === "assets-only" &&
				this.environment.name === "client"
			) {
				const workerNewConfig = ctx.resolvedPluginConfig.parsedNewConfig;
				assert(
					workerNewConfig,
					"Expected parsedNewConfig on assets-only resolved config"
				);
				writeOutputWorkerConfig(ctx.resolvedViteConfig.root, workerNewConfig);
				return;
			}

			const workerNewConfig = ctx.getWorkerNewConfig(this.environment.name);

			if (!workerNewConfig) {
				return;
			}

			const entryChunk = Object.values(bundle).find(
				(chunk) =>
					chunk.type === "chunk" &&
					chunk.isEntry &&
					chunk.name === MAIN_ENTRY_NAME
			);
			assert(entryChunk, `Expected entry chunk with name "${MAIN_ENTRY_NAME}"`);

			// Collect imported asset paths across all bundle entries
			const importedAssetPaths = new Set<string>();
			for (const entry of Object.values(bundle)) {
				for (const asset of entry.viteMetadata?.importedAssets ?? []) {
					importedAssetPaths.add(asset);
				}
			}

			const modules: Record<string, { type: ModuleType }> = {};
			for (const fileName of Object.keys(bundle)) {
				// Skip Vite's own manifest emitted via `build.manifest: true`.
				if (fileName === ".vite/manifest.json") {
					continue;
				}
				// Skip Vite-imported static assets — they will be moved out of
				// `bundle/` into the client `assets/` directory by the
				// asset move loop in `createBuildApp`.
				if (importedAssetPaths.has(fileName)) {
					continue;
				}
				modules[fileName] = { type: detectModuleType(fileName) };
			}

			writeOutputWorkerConfig(ctx.resolvedViteConfig.root, workerNewConfig, {
				mainModule: entryChunk.fileName,
				modules,
			});
		},
	};
});
