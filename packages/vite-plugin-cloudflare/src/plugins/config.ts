import assert from "node:assert";
import * as path from "node:path";
import { hasAssetsConfigChanged } from "../asset-config";
import { createBuildApp, removeAssetsField } from "../build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import { hasLocalDevVarsFileChanged } from "../dev-vars";
import { createPlugin, debuglog, getOutputDirectory } from "../utils";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import { getWarningForWorkersConfigs } from "../workers-configs";
import type { PluginContext } from "../context";
import type { EnvironmentOptions, UserConfig } from "vite";

/**
 * Plugin to handle configuration and config file watching
 */
export const configPlugin = createPlugin("config", (ctx) => {
	return {
		config(userConfig, env) {
			if (ctx.resolvedPluginConfig.type === "preview") {
				return { appType: "custom" };
			}

			if (!ctx.hasShownWorkerConfigWarnings) {
				ctx.setHasShownWorkerConfigWarnings(true);
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
				environments: getEnvironmentsConfig(ctx, userConfig, env.mode),
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
			ctx.setHasShownWorkerConfigWarnings(false);
		},
		configureServer(viteDevServer) {
			const configChangedHandler = async (changedFilePath: string) => {
				assertIsNotPreview(ctx);

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
		// This hook is not supported in Vite 6
		buildApp: {
			order: "post",
			async handler(builder) {
				if (ctx.resolvedPluginConfig.type !== "workers") {
					return;
				}

				const workerEnvironments = [
					...ctx.resolvedPluginConfig.environmentNameToWorkerMap.keys(),
				].map((environmentName) => {
					const environment = builder.environments[environmentName];
					assert(environment, `"${environmentName}" environment not found`);

					return environment;
				});

				// Build any Worker environments that haven't already been built
				await Promise.all(
					workerEnvironments
						.filter((environment) => !environment.isBuilt)
						.map((environment) => builder.build(environment))
				);

				const { entryWorkerEnvironmentName } = ctx.resolvedPluginConfig;
				const entryWorkerEnvironment =
					builder.environments[entryWorkerEnvironmentName];
				assert(
					entryWorkerEnvironment,
					`No "${entryWorkerEnvironmentName}" environment`
				);
				const entryWorkerBuildDirectory = path.resolve(
					builder.config.root,
					entryWorkerEnvironment.config.build.outDir
				);

				if (!builder.environments.client?.isBuilt) {
					removeAssetsField(entryWorkerBuildDirectory);
				}
			},
		},
	};
});

/**
 * Generates the environment configuration for all Worker environments.
 */
function getEnvironmentsConfig(
	ctx: PluginContext,
	userConfig: UserConfig,
	mode: string
): Record<string, EnvironmentOptions> | undefined {
	if (ctx.resolvedPluginConfig.type !== "workers") {
		return undefined;
	}

	const workersConfig = ctx.resolvedPluginConfig;

	const workerEnvironments = Object.fromEntries(
		[...workersConfig.environmentNameToWorkerMap].flatMap(
			([environmentName, worker]) => {
				const childEnvironmentNames =
					workersConfig.environmentNameToChildEnvironmentNamesMap.get(
						environmentName
					) ?? [];

				const sharedOptions = {
					workerConfig: worker.config,
					userConfig,
					mode,
					hasNodeJsCompat: ctx.getNodeJsCompat(environmentName) !== undefined,
				};

				const parentConfig = [
					environmentName,
					createCloudflareEnvironmentOptions({
						...sharedOptions,
						environmentName,
						isEntryWorker:
							environmentName === workersConfig.entryWorkerEnvironmentName,
						isParentEnvironment: true,
					}),
				] as const;

				const childConfigs = childEnvironmentNames.map(
					(childEnvironmentName) =>
						[
							childEnvironmentName,
							createCloudflareEnvironmentOptions({
								...sharedOptions,
								environmentName: childEnvironmentName,
								isEntryWorker: false,
								isParentEnvironment: false,
							}),
						] as const
				);

				return [parentConfig, ...childConfigs];
			}
		)
	);

	return {
		...workerEnvironments,
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
	};
}
