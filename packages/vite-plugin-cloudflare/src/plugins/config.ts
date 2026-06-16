import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeOutputWorkerConfig,
} from "@cloudflare/config";
import { normalizePath } from "vite";
import { hasAssetsConfigChanged } from "../asset-config";
import { createBuildApp, removeAssetsField } from "../build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import { writeDeployConfig } from "../deploy-config";
import { hasLocalDevVarsFileChanged } from "../dev-vars";
import {
	resolveDevOnly,
	type AssetsOnlyResolvedConfig,
	type WorkersResolvedConfig,
} from "../plugin-config";
import { createPlugin, debuglog, getOutputDirectory } from "../utils";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import { getWarningForWorkersConfigs } from "../workers-configs";
import type { PluginContext } from "../context";
import type { EnvironmentOptions, UserConfig } from "vite";
import type * as vite from "vite";
import type { Unstable_RawConfig } from "wrangler";

/**
 * Plugin to handle configuration and config file watching
 */
export const configPlugin = createPlugin("config", (ctx) => {
	return {
		config(userConfig, env) {
			if (ctx.resolvedPluginConfig.type === "preview") {
				return {
					appType: "custom",
				};
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
				".npmrc",
				".yarnrc",
				".yarnrc.yml",
				"*.{crt,pem,key,pfx,p12,p8,jks}",
				"**/.git/**",
				".dev.vars",
				".dev.vars.*",
				"**/.wrangler/**",
			];

			return {
				appType: "custom",
				server: {
					allowedHosts: getAllowedHosts(
						ctx.getTunnelHostnames(),
						userConfig.server?.allowedHosts
					),
					fs: {
						deny: [
							...defaultDeniedFiles,
							...Array.from(
								ctx.resolvedPluginConfig.configPaths,
								(configPath) => normalizePath(configPath)
							),
						],
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
		async configResolved(resolvedViteConfig) {
			ctx.setResolvedViteConfig(resolvedViteConfig);

			if (ctx.resolvedPluginConfig.type === "preview") {
				return;
			}

			validateWorkerEnvironmentOptions(
				ctx.resolvedPluginConfig,
				ctx.resolvedViteConfig
			);

			if (ctx.resolvedPluginConfig.experimental.newConfig?.cfBuildOutput) {
				forceBuildOutputDirs(ctx.resolvedPluginConfig, ctx.resolvedViteConfig);
				if (ctx.resolvedViteConfig.command === "build") {
					await cleanBuildOutputDir(ctx.resolvedViteConfig.root);
				}
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
					...ctx.resolvedPluginConfig.environmentNameToWorkerMap.entries(),
				]
					.filter(([_, worker]) => !resolveDevOnly(worker.devOnly))
					.map(([environmentName]) => {
						const environment = builder.environments[environmentName];
						assert(environment, `"${environmentName}" environment not found`);

						return environment;
					});

				// Build Worker environments that have not yet been built and are not dev-only
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

				const cfBuildOutput =
					ctx.resolvedPluginConfig.experimental.newConfig?.cfBuildOutput ===
					true;

				if (entryWorkerEnvironment.isBuilt) {
					if (!builder.environments.client?.isBuilt && !cfBuildOutput) {
						// The client environment was not built so we remove the assets config

						const entryWorkerBuildDirectory = path.resolve(
							builder.config.root,
							entryWorkerEnvironment.config.build.outDir
						);

						removeAssetsField(entryWorkerBuildDirectory);
					}
				} else {
					// The entry Worker was only used in development so we emit an assets-only config

					const clientEnvironment = builder.environments.client;
					assert(clientEnvironment, 'No "client" environment');

					if (!clientEnvironment.isBuilt) {
						throw new Error(
							"If `assetsOnly` is set to `true`, the client environment must be built"
						);
					}

					if (cfBuildOutput) {
						const entryWorkerNewConfig = ctx.getWorkerNewConfig(
							entryWorkerEnvironmentName
						);
						assert(
							entryWorkerNewConfig,
							`No config found for "${entryWorkerEnvironmentName}" environment`
						);
						await writeOutputWorkerConfig(
							builder.config.root,
							entryWorkerNewConfig
						);
					} else {
						const entryWorkerConfig = ctx.getWorkerConfig(
							entryWorkerEnvironmentName
						);
						assert(
							entryWorkerConfig,
							`No config found for "${entryWorkerEnvironmentName}" environment`
						);

						const outputConfig: Unstable_RawConfig = {
							...entryWorkerConfig,
							main: undefined,
							assets: {
								...entryWorkerConfig.assets,
								directory: ".",
								binding: undefined,
							},
						};

						if (
							outputConfig.unsafe &&
							Object.keys(outputConfig.unsafe).length === 0
						) {
							outputConfig.unsafe = undefined;
						}

						fs.writeFileSync(
							path.resolve(
								builder.config.root,
								clientEnvironment.config.build.outDir,
								"wrangler.json"
							),
							JSON.stringify(outputConfig)
						);

						writeDeployConfig(
							ctx.resolvedPluginConfig,
							ctx.resolvedViteConfig,
							true
						);
					}
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
	assertIsNotPreview(ctx);

	if (!ctx.resolvedPluginConfig.environmentNameToWorkerMap.size) {
		return;
	}

	const workerEnvironments = Object.fromEntries(
		[...ctx.resolvedPluginConfig.environmentNameToWorkerMap].flatMap(
			([environmentName, worker]) => {
				const childEnvironmentNames =
					ctx.resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap.get(
						environmentName
					) ?? [];

				const sharedOptions = {
					workerConfig: worker.config,
					userConfig,
					mode,
					hasNodeJsCompat: ctx.getNodeJsCompat(environmentName) !== undefined,
				};

				const isEntryWorker =
					environmentName ===
						ctx.resolvedPluginConfig.prerenderWorkerEnvironmentName ||
					(ctx.resolvedPluginConfig.type === "workers" &&
						environmentName ===
							ctx.resolvedPluginConfig.entryWorkerEnvironmentName);

				const parentConfig = [
					environmentName,
					createCloudflareEnvironmentOptions({
						...sharedOptions,
						environmentName,
						isEntryWorker,
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

/**
 * When the Build Output API is enabled,
 * force every Worker environment's and the client environment's `build.outDir`
 * to the spec-mandated location.
 *
 * Runs after Vite's merge in `configResolved`, so it overrides any
 * user-supplied `build.outDir`
 */
function forceBuildOutputDirs(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig
): void {
	const newConfig = resolvedPluginConfig.experimental.newConfig;
	if (!newConfig?.cfBuildOutput) {
		return;
	}

	const { root } = resolvedViteConfig;
	let clientWorkerName: string;

	if (resolvedPluginConfig.type === "workers") {
		for (const [
			environmentName,
			worker,
		] of resolvedPluginConfig.environmentNameToWorkerMap) {
			const environment = resolvedViteConfig.environments[environmentName];
			if (!environment) {
				continue;
			}
			assert(worker.parsedNewConfig, "Expected parsedNewConfig to be defined");
			environment.build.outDir = getWorkerBundleDir(
				root,
				worker.parsedNewConfig.name
			);
		}

		const entryName = resolvedPluginConfig.entryWorkerEnvironmentName;
		const entryWorker =
			resolvedPluginConfig.environmentNameToWorkerMap.get(entryName);
		assert(entryWorker, `Expected entry worker for environment "${entryName}"`);
		assert(
			entryWorker.parsedNewConfig,
			"Expected parsedNewConfig to be defined"
		);
		clientWorkerName = entryWorker.parsedNewConfig.name;
	} else {
		assert(
			resolvedPluginConfig.parsedNewConfig,
			"Expected parsedNewConfig to be defined"
		);
		clientWorkerName = resolvedPluginConfig.parsedNewConfig.name;
	}

	const clientEnvironment = resolvedViteConfig.environments.client;
	if (clientEnvironment) {
		clientEnvironment.build.outDir = getWorkerAssetsDir(root, clientWorkerName);
	}
}

function getAllowedHosts(
	tunnelHostnames: string[],
	userAllowedHosts: true | string[] | undefined
): true | string[] | undefined {
	if (tunnelHostnames.length === 0 || userAllowedHosts === true) {
		return userAllowedHosts;
	}

	return Array.from(new Set([...(userAllowedHosts ?? []), ...tunnelHostnames]));
}
