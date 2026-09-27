import assert from "node:assert";
import * as path from "node:path";
import {
	writeRootConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { isPreviewBuild } from "../build-output-env";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { createPlugin } from "../utils";
import type { ModuleType } from "@cloudflare/config";

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
				const workerNewConfig =
					ctx.resolvedPluginConfig.parsedNewConfig?.worker;
				assert(
					workerNewConfig,
					"Expected a Worker on assets-only resolved config"
				);
				await writeWorkerConfig({
					root: ctx.resolvedViteConfig.root,
					config: workerNewConfig,
				});
				await writeRoot();
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

			await writeWorkerConfig({
				root: ctx.resolvedViteConfig.root,
				config: workerNewConfig,
				manifest: {
					type: "complete",
					mainModule: entryChunk.fileName,
					modules,
				},
			});
			await writeRoot();
		},
	};

	/**
	 * Write the root `config.json`, recording the settings shared by every
	 * Worker, including the Vite mode the build ran in.
	 *
	 * Written even when there are no account settings, so the build context is
	 * always captured.
	 */
	async function writeRoot(): Promise<void> {
		if (ctx.resolvedPluginConfig.type === "preview") {
			return;
		}
		const config = ctx.resolvedPluginConfig.parsedNewConfig;
		const settings = config && {
			accountId: config.accountId,
			complianceRegion: config.complianceRegion,
		};

		await writeRootConfig(ctx.resolvedViteConfig.root, settings, {
			isPreview: isPreviewBuild(),
			mode: ctx.resolvedViteConfig.mode,
		});
	}
});

/**
 * Map a bundle filename to its declared module type.
 */
export function detectModuleType(filename: string): ModuleType {
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
