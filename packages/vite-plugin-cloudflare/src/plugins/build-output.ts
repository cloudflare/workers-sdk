import assert from "node:assert";
import * as path from "node:path";
import {
	writeRootConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { createPlugin } from "../utils";
import { getExperimentalCommonJsModuleTypes } from "./commonjs-module-registry";
import type { ModuleType } from "@cloudflare/config";
import type { ExperimentalJavaScriptSourceType } from "@cloudflare/workers-utils";

/**
 * Build Output Specification plugin. Replaces `outputConfigPlugin` when
 * `experimental.newConfig.cfBuildOutput` is set.
 */
export const buildOutputPlugin = createPlugin("build-output", (ctx) => {
	return {
		async writeBundle(_, bundle) {
			if (ctx.isChildEnvironment(this.environment.name)) {
				return;
			}

			if (
				ctx.resolvedPluginConfig.type === "assets-only" &&
				this.environment.name === "client"
			) {
				const defaultExport = ctx.resolvedPluginConfig.parsedNewConfig?.default;
				const workerNewConfig =
					defaultExport?.type === "worker" ? defaultExport : undefined;
				assert(
					workerNewConfig,
					"Expected a default worker export on assets-only resolved config"
				);
				await writeWorkerConfig(ctx.resolvedViteConfig.root, workerNewConfig);
				await writeSettingsConfig();
				return;
			}

			// The Build Output Specification currently holds a single Worker in
			// the `default` directory. Only the entry Worker is emitted;
			// auxiliary Worker environments are ignored for now.
			if (
				ctx.resolvedPluginConfig.type === "workers" &&
				this.environment.name !==
					ctx.resolvedPluginConfig.entryWorkerEnvironmentName
			) {
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
			const commonJsModuleTypes = getExperimentalCommonJsModuleTypes(
				ctx,
				this.environment.name
			);
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
				modules[fileName] = {
					type: detectModuleType(fileName, commonJsModuleTypes.get(fileName)),
				};
			}

			await writeWorkerConfig(ctx.resolvedViteConfig.root, workerNewConfig, {
				mainModule: entryChunk.fileName,
				modules,
			});
			await writeSettingsConfig();
		},
	};

	async function writeSettingsConfig(): Promise<void> {
		if (ctx.resolvedPluginConfig.type === "preview") {
			return;
		}
		const settingsExport = ctx.resolvedPluginConfig.parsedNewConfig?.settings;
		const settings =
			settingsExport?.type === "settings" ? settingsExport : undefined;
		if (!settings) {
			return;
		}
		await writeRootConfig(ctx.resolvedViteConfig.root, settings);
	}
});

/**
 * Map a bundle filename to its declared module type.
 */
export function detectModuleType(
	filename: string,
	explicitType?: ExperimentalJavaScriptSourceType
): ModuleType {
	if (explicitType !== undefined) {
		return explicitType === "commonjs" ? "cjs" : "esm";
	}
	const ext = path.extname(filename).toLowerCase();

	switch (ext) {
		case ".js":
		case ".mjs":
			return "esm";
		case ".wasm":
			return "wasm";
		case ".bin":
			return "data";
		case ".txt":
		case ".html":
		case ".sql":
			return "text";
		case ".json":
			return "json";
		case ".map":
			return "sourcemap";
		default:
			return "data";
	}
}
