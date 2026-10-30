import * as path from "node:path";
import {
	cleanBuildOutputDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
} from "@cloudflare/build-output-utils";
import { normalizePath } from "vite";
import { createBuildApp } from "../build";
import {
	applyWorkerEsbuildSupported,
	cloudflareBuiltInModules,
	createCloudflareEnvironmentOptions,
} from "../cloudflare-environment";
import { assertIsNotPreview } from "../context";
import {
	type AssetsOnlyResolvedConfig,
	type WorkersResolvedConfig,
} from "../plugin-config";
import { createPlugin, getOutputDirectory } from "../utils";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import { getServerWatchConfig } from "./cloudflare-watch-ignore";
import type { PluginContext } from "../context";
import type { EnvironmentOptions, UserConfig } from "vite";
import type * as vite from "vite";

/**
 * Plugin to handle configuration and config file watching
 */
export const configPlugin = createPlugin("config", (ctx) => {
	let root: string;

	return {
		config(userConfig, env) {
			root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();

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
				"**/.cloudflare/**",
				"**/.wrangler/**",
			];

			return {
				appType: "custom",
				server: {
					allowedHosts: getAllowedHosts(
						ctx.getTunnelHostnames(),
						userConfig.server?.allowedHosts
					),
					watch: getServerWatchConfig(userConfig.server?.watch),
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
		// Set the Build Output directories before Vite resolves the config, so that every plugin
		// reads them from the resolved config. `post` overrides directories set by the user or
		// by other plugins' earlier `configEnvironment` hooks; a build fails if a later hook
		// moves them (see `validateBuildOutputDirs`).
		configEnvironment: {
			order: "post",
			handler(environmentName) {
				if (ctx.resolvedPluginConfig.type === "preview") {
					return;
				}
				const outDir = getEnvironmentBuildOutputDir(
					ctx.resolvedPluginConfig,
					root,
					environmentName
				);
				return outDir ? { build: { outDir } } : undefined;
			},
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

			// Assets-only configs can still hold Worker environments (a prerender
			// Worker), so this covers both resolved config types.
			const {
				environmentNameToWorkerMap,
				environmentNameToChildEnvironmentNamesMap,
			} = ctx.resolvedPluginConfig;
			applyWorkerEsbuildSupported(resolvedViteConfig, [
				...environmentNameToWorkerMap.keys(),
				...[...environmentNameToChildEnvironmentNamesMap.values()].flat(),
			]);

			if (ctx.resolvedViteConfig.command === "build") {
				validateBuildOutputDirs(
					ctx.resolvedPluginConfig,
					ctx.resolvedViteConfig,
					root
				);
				await cleanBuildOutputDir(ctx.resolvedViteConfig.root);
			}
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
 * Gets the directory the Build Output Specification mandates for an environment's build.
 * Child environments are nested within their parent environment's directory.
 *
 * @param resolvedPluginConfig The resolved plugin configuration
 * @param root The Vite project root
 * @param environmentName The name of the environment
 * @returns The environment's Build Output directory, or `undefined` if it has none
 */
function getEnvironmentBuildOutputDir(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	root: string,
	environmentName: string
): string | undefined {
	if (environmentName === "client") {
		return getWorkerAssetsDir(root);
	}

	const worker =
		resolvedPluginConfig.environmentNameToWorkerMap.get(environmentName);
	if (worker) {
		return getWorkerBundleDir(root, worker.directoryName);
	}

	for (const [
		parentEnvironmentName,
		childEnvironmentNames,
	] of resolvedPluginConfig.environmentNameToChildEnvironmentNamesMap) {
		if (childEnvironmentNames.includes(environmentName)) {
			const parentDir = getEnvironmentBuildOutputDir(
				resolvedPluginConfig,
				root,
				parentEnvironmentName
			);
			return parentDir && path.join(parentDir, environmentName);
		}
	}

	return undefined;
}

/**
 * Throws if another plugin moved an environment's `build.outDir` after the `configEnvironment`
 * hook set it to the environment's Build Output directory.
 *
 * @param resolvedPluginConfig The resolved plugin configuration
 * @param resolvedViteConfig The resolved Vite config
 * @param root The project root the `configEnvironment` hook resolved the directories against.
 * Vite's resolved root can differ in spelling (Vite 8 resolves it through symlinks), so the
 * directories are compared as that hook computed them.
 */
function validateBuildOutputDirs(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig,
	root: string
): void {
	const movedDirs = Object.entries(resolvedViteConfig.environments).flatMap(
		([environmentName, environment]) => {
			const expectedDir = getEnvironmentBuildOutputDir(
				resolvedPluginConfig,
				root,
				environmentName
			);
			const outDir = path.resolve(
				resolvedViteConfig.root,
				environment.build.outDir
			);
			return expectedDir && outDir !== expectedDir
				? [
						`	- "${environmentName}" environment: \`build.outDir\`: ${JSON.stringify(outDir)} (required: ${JSON.stringify(expectedDir)})\n`,
					]
				: [];
		}
	);

	if (movedDirs.length) {
		throw new Error(
			`The following environment options are incompatible with the Cloudflare Vite plugin:\n${movedDirs.join("")}Another plugin changed them after the Cloudflare Vite plugin set them. The Cloudflare Vite plugin builds each environment into its Build Output directory, which can't be changed.\n`
		);
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
