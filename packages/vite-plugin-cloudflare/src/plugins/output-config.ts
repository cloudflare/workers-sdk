import assert from "node:assert";
import * as path from "node:path";
import { MAIN_ENTRY_NAME } from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import { writeDeployConfig } from "../deploy-config";
import { getLocalDevVarsForPreview } from "../dev-vars";
import { createPlugin } from "../utils";
import type * as vite from "vite";
import type { Unstable_RawConfig } from "wrangler";

/**
 * Plugin to generate additional output files as part of the build, including the output `wrangler.json` file.
 */
export const outputConfigPlugin = createPlugin("output-config", (ctx) => {
	return {
		generateBundle(_, bundle) {
			assertIsNotPreview(ctx);

			// Child environments should not emit wrangler.json or .dev.vars files
			if (ctx.isChildEnvironment(this.environment.name)) {
				return;
			}

			let outputConfig: Unstable_RawConfig | undefined;

			if (ctx.resolvedPluginConfig.type === "workers") {
				const inputConfig = ctx.getWorkerConfig(this.environment.name);

				if (!inputConfig) {
					return;
				}

				const entryChunk = Object.values(bundle).find(
					(chunk) =>
						chunk.type === "chunk" &&
						chunk.isEntry &&
						chunk.name === MAIN_ENTRY_NAME
				);

				assert(
					entryChunk,
					`Expected entry chunk with name "${MAIN_ENTRY_NAME}"`
				);

				const isEntryWorker =
					this.environment.name ===
					ctx.resolvedPluginConfig.entryWorkerEnvironmentName;

				outputConfig = {
					...inputConfig,
					main: entryChunk.fileName,
					no_bundle: true,
					rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
					assets: isEntryWorker
						? {
								...inputConfig.assets,
								directory: getAssetsDirectory(
									this.environment.config.build.outDir,
									ctx.resolvedViteConfig
								),
							}
						: undefined,
				};

				if (inputConfig.configPath) {
					const localDevVars = getLocalDevVarsForPreview(
						inputConfig.configPath,
						ctx.resolvedPluginConfig.cloudflareEnv
					);
					// Save a .dev.vars file to the worker's build output directory if there are local dev vars, so that it will be then detected by `vite preview`.
					if (localDevVars) {
						this.emitFile({
							type: "asset",
							fileName: ".dev.vars",
							source: localDevVars,
						});
					}
				}
			} else if (this.environment.name === "client") {
				const inputConfig = ctx.resolvedPluginConfig.config;

				outputConfig = {
					...inputConfig,
					assets: {
						...inputConfig.assets,
						directory: ".",
					},
				};

				const filesToAssetsIgnore = ["wrangler.json", ".dev.vars"];

				this.emitFile({
					type: "asset",
					fileName: ".assetsignore",
					source: `${filesToAssetsIgnore.join("\n")}\n`,
				});
			}

			if (!outputConfig) {
				return;
			}

			// Set to `undefined` if it's an empty object so that the user doesn't see a warning about using `unsafe` fields when deploying their Worker.
			if (
				outputConfig.unsafe &&
				Object.keys(outputConfig.unsafe).length === 0
			) {
				outputConfig.unsafe = undefined;
			}

			this.emitFile({
				type: "asset",
				fileName: "wrangler.json",
				source: JSON.stringify(outputConfig),
			});
		},
		writeBundle() {
			assertIsNotPreview(ctx);

			// These conditions ensure the deploy config is emitted once per application build as `writeBundle` is called for each environment.
			// If Vite introduces an additional hook that runs after the application has built then we could use that instead.
			if (
				this.environment.name ===
				(ctx.resolvedPluginConfig.type === "workers"
					? ctx.resolvedPluginConfig.entryWorkerEnvironmentName
					: "client")
			) {
				writeDeployConfig(ctx.resolvedPluginConfig, ctx.resolvedViteConfig);
			}
		},
	};
});

function getAssetsDirectory(
	workerOutputDirectory: string,
	resolvedViteConfig: vite.ResolvedConfig
): string {
	const clientOutputDirectory =
		resolvedViteConfig.environments.client?.build.outDir;

	assert(
		clientOutputDirectory,
		"Unexpected error: client output directory is undefined"
	);

	return path.relative(
		path.resolve(resolvedViteConfig.root, workerOutputDirectory),
		path.resolve(resolvedViteConfig.root, clientOutputDirectory)
	);
}
