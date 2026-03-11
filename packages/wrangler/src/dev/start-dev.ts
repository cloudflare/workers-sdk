import path from "node:path";
import { bold, green } from "@cloudflare/cli/colors";
import { generateContainerBuildId } from "@cloudflare/containers-shared";
import { getRegistryPath } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { createServer } from "../api/server";
import { convertStartDevOptionsToBindings } from "../api/startDevWorker/utils";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { getSiteAssetPaths } from "../sites";
import {
	collectKeyValues,
	collectPlainTextVars,
} from "../utils/collectKeyValues";
import type { StartDevWorkerInput, Trigger } from "../api";
import type { WorkerServer } from "../api/server";
import type { StartDevOptionsBindings } from "../api/startDevWorker/utils";
import type { StartDevOptions } from "../dev";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Starts a dev server session given the `args`.
 */
export async function startDev(args: StartDevOptions) {
	let server: WorkerServer | undefined;
	try {
		if (args.logLevel) {
			logger.loggerLevel = args.logLevel;
		}

		if (args.remote) {
			logger.log(
				bold(
					dedent`
						Support for remote bindings in ${green("`wrangler dev`")} is now available as a replacement for ${green("`wrangler dev --remote`")}. Try it out now by running ${green("`wrangler dev`")} with the ${green("`remote`")} option enabled on your resources and let us know how it goes!
						This gives you access to remote resources in development while retaining all the usual benefits of local dev: fast iteration speed, breakpoint debugging, and more.

						Refer to https://developers.cloudflare.com/workers/development-testing/#remote-bindings for more information.`
				)
			);
		}

		const [primaryWorkerConfig, ...auxiliaryWorkerConfigs] = Array.isArray(
			args.config
		)
			? args.config
			: [args.config];
		const hasMultipleWorkers = auxiliaryWorkerConfigs.length > 0;
		const workers = [
			await createWorkerInput(primaryWorkerConfig, {
				...args,
				multiworkerPrimary: hasMultipleWorkers,
			}),
		];

		if (hasMultipleWorkers) {
			const auxiliaryWorkers = await Promise.all(
				auxiliaryWorkerConfigs.map((configPath) =>
					createWorkerInput(configPath, {
						env: args.env,
						disableDevRegistry: args.disableDevRegistry,
						multiworkerPrimary: false,
					})
				)
			);

			workers.push(...auxiliaryWorkers);
		}

		server = createServer({
			root: process.cwd(),
			accountId: args.accountId,
			build: {
				workers,
			},
		});

		if (isInteractive() && args.showInteractiveDevSession !== false) {
			server.registerHotKeys(args);
		}

		const { url } = await server.listen();
		if (args.onReady) {
			args.onReady(url.hostname, parseInt(url.port));
		}

		if (
			(args.enableIpc || !args.onReady) &&
			process.send &&
			typeof vitest === "undefined"
		) {
			process.send(
				JSON.stringify({
					event: "DEV_SERVER_READY",
					ip: url.hostname,
					port: parseInt(url.port),
				})
			);
		}

		return server;
	} catch (e) {
		await server?.close();
		throw e;
	}
}

async function createWorkerInput(
	configPath: string | undefined,
	args: Partial<StartDevOptions> & { multiworkerPrimary?: boolean }
) {
	return {
		name: args.name,
		config: configPath,
		entrypoint: args.script,
		compatibilityDate: args.compatibilityDate,
		compatibilityFlags: args.compatibilityFlags,
		triggers: args.routes?.map<Extract<Trigger, { type: "route" }>>((r) => ({
			type: "route",
			pattern: r,
		})),
		env: args.env,
		envFiles: args.envFile,
		build: {
			bundle: args.bundle !== undefined ? args.bundle : undefined,
			define: collectKeyValues(args.define),
			jsxFactory: args.jsxFactory,
			jsxFragment: args.jsxFragment,
			tsconfig: args.tsconfig,
			minify: args.minify,
			processEntrypoint: args.processEntrypoint,
			additionalModules: args.additionalModules,
			moduleRoot: args.moduleRoot,
			moduleRules: args.rules,
			nodejsCompatMode: (parsedConfig: Config) =>
				validateNodeCompatMode(
					args.compatibilityDate ?? parsedConfig.compatibility_date,
					args.compatibilityFlags ?? parsedConfig.compatibility_flags ?? [],
					{
						noBundle: args.noBundle ?? parsedConfig.no_bundle,
					}
				),
		},
		bindings: {
			...(await getPagesAssetsFetcher(args.enablePagesAssetsServiceBinding)),
			...collectPlainTextVars(args.var),
			...convertStartDevOptionsToBindings(args as StartDevOptionsBindings),
		},
		defaultBindings: args.defaultBindings,
		dev: {
			remote: args.enablePagesAssetsServiceBinding
				? // When running `wrangler pages dev` we want `remote` to be `undefined` since that's the
					// only supported mode for pages (note: we can't set it to `false` as that would break
					// the AI binding)
					undefined
				: args.remote || (args.forceLocal || args.local ? false : undefined),
			server: {
				hostname: args.ip,
				port: args.port,
				secure:
					args.localProtocol === undefined
						? undefined
						: args.localProtocol === "https",
				httpsCertPath: args.httpsCertPath,
				httpsKeyPath: args.httpsKeyPath,
			},
			inspector: {
				hostname: args.inspectorIp,
				port: args.inspectorPort,
			},
			origin: {
				hostname: args.host ?? args.localUpstream,
				secure:
					args.upstreamProtocol === undefined
						? undefined
						: args.upstreamProtocol === "https",
			},
			persist: args.persistTo,
			liveReload: args.liveReload,
			testScheduled: args.testScheduled,
			logLevel: args.logLevel,
			registry: args.disableDevRegistry ? undefined : getRegistryPath(),
			multiworkerPrimary: args.multiworkerPrimary,
			enableContainers: args.enableContainers,
			dockerPath: args.dockerPath,
			// initialise with a random id
			containerBuildId: generateContainerBuildId(),
			generateTypes: args.types,
		},
		legacy: {
			site: (configParam: Config) => {
				const legacyAssetPaths = getResolvedSiteAssetPaths(args, configParam);
				return Boolean(args.site || configParam.site) && legacyAssetPaths
					? {
							bucket: path.join(
								legacyAssetPaths.baseDirectory,
								legacyAssetPaths?.assetDirectory
							),
							include: legacyAssetPaths.includePatterns,
							exclude: legacyAssetPaths.excludePatterns,
						}
					: undefined;
			},
			useServiceEnvironments: !(args.legacyEnv ?? true),
		},
		assets: args.assets,
		experimental: {
			tailLogs: !!args.experimentalTailLogs,
		},
	} satisfies StartDevWorkerInput;
}

async function getPagesAssetsFetcher(
	options: EnablePagesAssetsServiceBindingOptions | undefined
): Promise<StartDevWorkerInput["bindings"] | undefined> {
	if (options !== undefined) {
		// `./miniflare-cli/assets` dynamically imports`@cloudflare/pages-shared/environment-polyfills`.
		// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
		// augmentations that pollute the `import`-site's typing environment.
		//
		// We `require` instead of `import`ing here to avoid polluting the main
		// `wrangler` TypeScript project with the `global` augmentations. This
		// relies on the fact that `require` is untyped.
		//
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const generateASSETSBinding = require("../miniflare-cli/assets").default;
		return {
			ASSETS: {
				type: "fetcher",
				fetcher: await generateASSETSBinding({
					log: logger,
					...options,
				}),
			},
		};
	}
}

function getResolvedSiteAssetPaths(
	args: Partial<StartDevOptions>,
	configParam: Config
) {
	return getSiteAssetPaths(
		configParam,
		args.site,
		args.siteInclude,
		args.siteExclude
	);
}
