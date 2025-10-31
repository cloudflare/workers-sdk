import { hasAssetsConfigChanged } from "../asset-config";
import { createBuildApp } from "../build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { hasLocalDevVarsFileChanged } from "../dev-vars";
import { assertIsNotPreview } from "../plugin-config";
import { debuglog, getOutputDirectory } from "../utils";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import { getWarningForWorkersConfigs } from "../workers-configs";
import { createPlugin } from "./utils";

export const configPlugin = createPlugin("config", (ctx) => {
	return {
		config(userConfig, env) {
			if (ctx.resolvedPluginConfig.type === "preview") {
				return { appType: "custom" };
			}

			if (!ctx.hasShownWorkerConfigWarnings) {
				ctx.hasShownWorkerConfigWarnings = true;
				const workerConfigWarnings = getWarningForWorkersConfigs(
					ctx.resolvedPluginConfig.rawConfigs
				);
				if (workerConfigWarnings) {
					console.warn(workerConfigWarnings);
				}
			}

			const defaultDeniedFiles = [
				".env",
				".env.*",
				"*.{crt,pem}",
				"**/.git/**",
			];

			return {
				appType: "custom",
				server: {
					fs: {
						deny: [...defaultDeniedFiles, ".dev.vars", ".dev.vars.*"],
					},
				},
				environments:
					ctx.resolvedPluginConfig.type === "workers"
						? {
								...Object.fromEntries(
									Object.entries(ctx.resolvedPluginConfig.workers).map(
										([environmentName, workerConfig]) => {
											return [
												environmentName,
												createCloudflareEnvironmentOptions({
													workerConfig,
													userConfig,
													mode: env.mode,
													environmentName,
													isEntryWorker:
														ctx.resolvedPluginConfig.type === "workers" &&
														environmentName ===
															ctx.resolvedPluginConfig
																.entryWorkerEnvironmentName,
													hasNodeJsCompat:
														ctx.getNodeJsCompat(environmentName) !== undefined,
												}),
											];
										}
									)
								),
								client: {
									build: {
										outDir: getOutputDirectory(userConfig, "client"),
									},
									optimizeDeps: {
										// Some frameworks allow users to mix client and server code in the same file and then extract the server code.
										// As the dependency optimization may happen before the server code is extracted, we should exclude Cloudflare built-ins from client optimization.
										exclude: [...cloudflareBuiltInModules],
									},
								},
							}
						: undefined,
				builder: {
					buildApp:
						userConfig.builder?.buildApp ??
						createBuildApp(ctx.resolvedPluginConfig),
				},
			};
		},
		configResolved(resolvedViteConfig) {
			ctx.setResolvedViteConfig(resolvedViteConfig);

			if (ctx.resolvedPluginConfig.type === "workers") {
				validateWorkerEnvironmentOptions(
					ctx.resolvedPluginConfig,
					ctx.resolvedViteConfig
				);
			}
		},
		buildStart() {
			ctx.hasShownWorkerConfigWarnings = false;
		},
		configureServer(viteDevServer) {
			// Patch the `server.restart` method to track whether the server is restarting or not.
			const restartServer = viteDevServer.restart.bind(viteDevServer);
			viteDevServer.restart = async () => {
				try {
					ctx.isRestartingDevServer = true;
					debuglog("From server.restart(): Restarting server...");
					await restartServer();
					debuglog("From server.restart(): Restarted server...");
				} finally {
					ctx.isRestartingDevServer = false;
				}
			};

			const configChangedHandler = async (changedFilePath: string) => {
				assertIsNotPreview(ctx.resolvedPluginConfig);

				if (
					ctx.resolvedPluginConfig.configPaths.has(changedFilePath) ||
					hasLocalDevVarsFileChanged(
						ctx.resolvedPluginConfig,
						changedFilePath
					) ||
					hasAssetsConfigChanged(
						ctx.resolvedPluginConfig,
						ctx.resolvedViteConfig,
						changedFilePath
					)
				) {
					debuglog("Config changed: " + changedFilePath);
					viteDevServer.watcher.off("change", configChangedHandler);
					debuglog("Restarting dev server and aborting previous setup");
					await viteDevServer.restart();
				}
			};
			viteDevServer.watcher.on("change", configChangedHandler);
		},
	};
});
