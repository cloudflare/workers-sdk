import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeSettingsConfig,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { createPlugin } from "../utils";
import type { ModuleType } from "@cloudflare/config";

/**
 * Build Output Specification plugin. Replaces `outputConfigPlugin` when
 * `experimental.newConfig.cfBuildOutput` is set.
 */
export const buildOutputPlugin = createPlugin("build-output", (ctx) => {
	return {
		buildApp: {
			order: "post",
			async handler(builder) {
				const clientEnvironment = builder.environments.client;
				if (clientEnvironment?.isBuilt) {
					linkBuildOutputDirectory(
						getWorkerAssetsDir(builder.config.root),
						path.resolve(
							builder.config.root,
							clientEnvironment.config.build.outDir
						)
					);
				}

				if (ctx.resolvedPluginConfig.type === "workers") {
					const entryEnvironment =
						builder.environments[
							ctx.resolvedPluginConfig.entryWorkerEnvironmentName
						];
					assert(entryEnvironment, "Entry Worker environment not found");

					if (entryEnvironment.isBuilt) {
						linkBuildOutputDirectory(
							getWorkerBundleDir(builder.config.root),
							path.resolve(
								builder.config.root,
								entryEnvironment.config.build.outDir
							)
						);
					}
				}
			},
		},
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
				await writeWorkerConfig({
					root: ctx.resolvedViteConfig.root,
					config: workerNewConfig,
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
				// Skip Vite-imported static assets — they will be moved from the
				// entry Worker output into the client output by the asset move loop
				// in `createBuildApp`.
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
		const settingsExport = ctx.resolvedPluginConfig.parsedNewConfig?.settings;
		const settings =
			settingsExport?.type === "settings" ? settingsExport : undefined;

		await writeSettingsConfig(
			ctx.resolvedViteConfig.root,
			settings,
			ctx.resolvedViteConfig.mode
		);
	}
});

/**
 * Expose a Vite environment's output directory at the conventional Build
 * Output Specification path without relocating the completed build.
 */
export function linkBuildOutputDirectory(
	buildOutputDirectory: string,
	environmentOutputDirectory: string
): void {
	const linkPath = path.resolve(buildOutputDirectory);
	const targetPath = path.resolve(environmentOutputDirectory);

	if (linkPath === targetPath) {
		return;
	}

	const targetStats = fs.statSync(targetPath, { throwIfNoEntry: false });
	if (!targetStats?.isDirectory()) {
		throw new Error(
			`Cannot link Build Output Specification directory "${linkPath}" because environment output directory "${targetPath}" does not exist.`
		);
	}

	const linkStats = fs.lstatSync(linkPath, { throwIfNoEntry: false });
	if (linkStats) {
		if (
			linkStats.isSymbolicLink() &&
			fs.realpathSync(linkPath) === fs.realpathSync(targetPath)
		) {
			return;
		}

		throw new Error(
			`Cannot link Build Output Specification directory "${linkPath}" because it already exists.`
		);
	}

	if (areDirectoriesOverlapping(linkPath, targetPath)) {
		throw new Error(
			`Cannot link Build Output Specification directory "${linkPath}" to overlapping environment output directory "${targetPath}".`
		);
	}

	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
	fs.symlinkSync(
		process.platform === "win32"
			? targetPath
			: path.relative(path.dirname(linkPath), targetPath),
		linkPath,
		process.platform === "win32" ? "junction" : "dir"
	);
}

function areDirectoriesOverlapping(first: string, second: string): boolean {
	const resolvedFirst = resolveFromExistingAncestor(first);
	const resolvedSecond = resolveFromExistingAncestor(second);
	return (
		isDirectoryWithin(resolvedFirst, resolvedSecond) ||
		isDirectoryWithin(resolvedSecond, resolvedFirst)
	);
}

function isDirectoryWithin(parent: string, candidate: string): boolean {
	const relativePath = path.relative(parent, candidate);
	return (
		relativePath === "" ||
		(!path.isAbsolute(relativePath) &&
			relativePath !== ".." &&
			!relativePath.startsWith(`..${path.sep}`))
	);
}

function resolveFromExistingAncestor(directory: string): string {
	let ancestor = path.resolve(directory);
	const missingSegments: string[] = [];

	while (!fs.existsSync(ancestor)) {
		const parent = path.dirname(ancestor);
		if (parent === ancestor) {
			return path.resolve(directory);
		}
		missingSegments.unshift(path.basename(ancestor));
		ancestor = parent;
	}

	return path.join(fs.realpathSync(ancestor), ...missingSegments);
}

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
