import * as path from "node:path";
import { assertWranglerVersion } from "./assert-wrangler-version";
import { resolvePluginConfig } from "./config";
import { toRequest, writeResponse } from "./http";
import { createMiniflareOptions, MiniflareController } from "./miniflare";
import { emitWorkerConfigAsset, writeDeployConfig } from "./output";
import {
	createWorkerEnvironmentConfig,
	getOutputDirectory,
} from "./rsbuild-config";
import type { PluginConfig, ResolvedPluginConfig } from "./config";
import type { RsbuildPlugin } from "@rsbuild/core";

export type { PluginConfig } from "./config";

await assertWranglerVersion();

/**
 * Rsbuild plugin that builds and serves Cloudflare Workers with Wrangler config.
 */
export function cloudflare(pluginConfig: PluginConfig = {}): RsbuildPlugin {
	let resolvedConfig: ResolvedPluginConfig | undefined;
	const miniflareController = new MiniflareController();

	return {
		name: "rsbuild-plugin-workers",
		setup(api) {
			api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
				resolvedConfig = resolvePluginConfig(pluginConfig, {
					root: config.root
						? path.resolve(api.context.rootPath, config.root)
						: api.context.rootPath,
				});

				return mergeRsbuildConfig(config, {
					environments: {
						[resolvedConfig.environmentName]: createWorkerEnvironmentConfig(
							resolvedConfig,
							config
						),
					},
					dev: {
						writeToDisk: true,
					},
				});
			});

			api.processAssets(
				{ stage: "additional" },
				({ assets, environment, sources }) => {
					if (
						!resolvedConfig ||
						environment.name !== resolvedConfig.environmentName
					) {
						return;
					}

					emitWorkerConfigAsset(resolvedConfig, assets, sources);
				}
			);

			api.onAfterBuild(() => {
				if (!resolvedConfig) {
					return;
				}

				writeDeployConfig(resolvedConfig, api.getRsbuildConfig());
			});

			api.onAfterDevCompile(async ({ environments }) => {
				if (!resolvedConfig || !environments[resolvedConfig.environmentName]) {
					return;
				}

				await miniflareController.startOrUpdate(
					createMiniflareOptions(
						resolvedConfig,
						path.resolve(
							resolvedConfig.root,
							getOutputDirectory(
								api.getRsbuildConfig(),
								resolvedConfig.environmentName
							)
						)
					)
				);
			});

			api.onBeforeStartDevServer(({ server }) => {
				server.middlewares.use(async (req, res, next) => {
					try {
						const request = toRequest(req);
						const response = await miniflareController.dispatchFetch(request);
						await writeResponse(res, response);
					} catch (error) {
						next(error);
					}
				});
			});

			api.onCloseDevServer(async () => {
				await miniflareController.dispose();
			});
		},
	};
}
