import assert from "node:assert";
import * as path from "node:path";
import {
	writeSettingsConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { createPlugin } from "../utils";
import type { ModuleType } from "@cloudflare/config";

/** Emits the entry Worker using the Build Output Specification. */
export const buildOutputPlugin = createPlugin("build-output", (ctx) => {
	return {
		async writeBundle(_, bundle) {
			if (ctx.isChildEnvironment(this.environment.name)) {
				return;
			}

			if (ctx.resolvedPluginConfig.type === "assets-only") {
				if (this.environment.name !== "client") {
					return;
				}

				await writeWorkerConfig({
					root: ctx.resolvedViteConfig.root,
					config: ctx.resolvedPluginConfig.config,
				});
				await writeSettings();
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
			await writeSettings();
		},
	};

	/**
	 * Write the top-level `config.json`, recording the settings shared by every
	 * Worker, including the Vite mode the build ran in.
	 *
	 * Written even when there is no `settings` export, so the mode is always
	 * captured.
	 */
	async function writeSettings(): Promise<void> {
		if (ctx.resolvedPluginConfig.type === "preview") {
			return;
		}
		const settings = ctx.resolvedPluginConfig.parsedConfig.settings;

		await writeSettingsConfig(
			ctx.resolvedViteConfig.root,
			settings,
			ctx.resolvedViteConfig.mode
		);
	}
});

/** Map a bundle filename to its native module type. */
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
