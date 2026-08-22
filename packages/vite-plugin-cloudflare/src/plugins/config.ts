import assert from "node:assert";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { normalizePath } from "vite";
import { hasAssetsConfigChanged } from "../asset-config";
import { createBuildApp } from "../build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import {
	resolveDevOnly,
	type AssetsOnlyResolvedConfig,
	type WorkersResolvedConfig,
} from "../plugin-config";
import { createPlugin, debuglog, getOutputDirectory } from "../utils";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import type { PluginContext } from "../context";
import type { EnvironmentOptions, UserConfig } from "vite";
import type * as vite from "vite";

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

			forceBuildOutputDirs(ctx.resolvedPluginConfig, ctx.resolvedViteConfig);
			if (ctx.resolvedViteConfig.command === "build") {
				await cleanBuildOutputDir(ctx.resolvedViteConfig.root);
			}
		},
		configureServer(viteDevServer) {
			// This variable is used to guard against config changes triggering
			// a restart while another restart is already in flight. Note that we are
			// deliberately not calling `watcher.off` since on failed restarts
			// (e.g. the changed config is invalid) vite would resolve without replacing
			// the server, so a removed handler would never be re-registered and
			// config changes, including the one that fixes the config, would be
			// ignored for the rest of the session.
			let restartInFlight = false;

			const configChangedHandler = async (changedFilePath: string) => {
				assertIsNotPreview(ctx);

				if (restartInFlight) {
					return;
				}

				// TODO: Reinstate .env and .dev.vars watching when local variable
				// loading is supported with cloudflare.config.ts.
				if (
					ctx.resolvedPluginConfig.configPaths.has(changedFilePath) ||
					hasAssetsConfigChanged(
						ctx.resolvedPluginConfig,
						ctx.resolvedViteConfig,
						changedFilePath
					)
				) {
					debuglog("Config changed: " + changedFilePath);
					restartInFlight = true;
					debuglog("Restarting dev server and aborting previous setup");
					try {
						await viteDevServer.restart();
					} finally {
						restartInFlight = false;
					}
				}
			};

			viteDevServer.watcher.on("change", configChangedHandler);
		},
		buildApp: {
			order: "post",
			async handler(builder) {
				if (ctx.resolvedPluginConfig.type === "preview") {
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

				if (ctx.resolvedPluginConfig.type === "assets-only") {
					return;
				}

				const { entryWorkerEnvironmentName } = ctx.resolvedPluginConfig;
				const entryWorkerEnvironment =
					builder.environments[entryWorkerEnvironmentName];
				assert(
					entryWorkerEnvironment,
					`No "${entryWorkerEnvironmentName}" environment`
				);

				if (!entryWorkerEnvironment.isBuilt) {
					// The entry Worker was only used in development so we emit an assets-only config

					const clientEnvironment = builder.environments.client;
					assert(clientEnvironment, 'No "client" environment');

					if (!clientEnvironment.isBuilt) {
						throw new Error(
							"If `assetsOnly` is set to `true`, the client environment must be built"
						);
					}

					const entryWorkerNewConfig = ctx.getWorkerNewConfig(
						entryWorkerEnvironmentName
					);
					assert(
						entryWorkerNewConfig,
						`No config found for "${entryWorkerEnvironmentName}" environment`
					);
					await writeWorkerConfig({
						root: builder.config.root,
						config: entryWorkerNewConfig,
					});
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
 * When the Build Output Specification is enabled,
 * force Worker and client `build.outDir` values to their spec-mandated
 * locations.
 *
 * Runs after Vite's merge in `configResolved`, so it overrides any
 * user-supplied `build.outDir`
 */
function forceBuildOutputDirs(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig
): void {
	const { root } = resolvedViteConfig;

	for (const [
		environmentName,
		worker,
	] of resolvedPluginConfig.environmentNameToWorkerMap) {
		const environment = resolvedViteConfig.environments[environmentName];
		if (environment) {
			environment.build.outDir = getWorkerBundleDir(root, worker.directoryName);
		}
	}

	const clientEnvironment = resolvedViteConfig.environments.client;
	if (clientEnvironment) {
		clientEnvironment.build.outDir = getWorkerAssetsDir(root);
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
