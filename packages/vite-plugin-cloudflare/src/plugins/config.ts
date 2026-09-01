import * as path from "node:path";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
} from "@cloudflare/build-output-utils";
import { getDevVarsCandidatePaths } from "@cloudflare/workers-utils/local-env";
import { normalizePath } from "vite";
import { hasAssetsConfigChanged } from "../asset-config";
import { createBuildApp } from "../build";
import {
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import {
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
			const localDevVarsFiles = new Set(
				getDevVarsCandidatePaths(
					ctx.resolvedViteConfig.envDir,
					ctx.resolvedViteConfig.mode
				)
			);
			viteDevServer.watcher.add([...localDevVarsFiles]);

			const configChangedHandler = async (changedFilePath: string) => {
				assertIsNotPreview(ctx);

				if (restartInFlight) {
					return;
				}

				if (
					localDevVarsFiles.has(changedFilePath) ||
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
			viteDevServer.watcher.on("add", configChangedHandler);
			viteDevServer.watcher.on("unlink", configChangedHandler);
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
				const parentConfig = [
					environmentName,
					createCloudflareEnvironmentOptions({
						...sharedOptions,
						environmentName,
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
 * locations. Child environments are nested within their parent environment.
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

	for (const [
		parentEnvironmentName,
		childEnvironmentNames,
	] of resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap) {
		const parentEnvironment =
			resolvedViteConfig.environments[parentEnvironmentName];
		if (!parentEnvironment) {
			continue;
		}

		for (const childEnvironmentName of childEnvironmentNames) {
			const childEnvironment =
				resolvedViteConfig.environments[childEnvironmentName];
			if (childEnvironment) {
				childEnvironment.build.outDir = path.join(
					parentEnvironment.build.outDir,
					childEnvironmentName
				);
			}
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
