import assert from "node:assert";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { isWebContainer } from "@webcontainer/env";
import { watch } from "chokidar";
import { render } from "ink";
import { DevEnv } from "./api";
import {
	convertCfWorkerInitBindingstoBindings,
	extractBindingsOfType,
} from "./api/startDevWorker/utils";
import { processAssetsArg, validateAssetsArgsAndConfig } from "./assets";
import { findWranglerToml, printBindings, readConfig } from "./config";
import { validateRoutes } from "./deploy/deploy";
import { getEntry } from "./deployment-bundle/entry";
import { validateNodeCompatMode } from "./deployment-bundle/node-compat";
import { devRegistry, getBoundRegisteredWorkers } from "./dev-registry";
import Dev from "./dev/dev";
import { getVarsForDev } from "./dev/dev-vars";
import { getLocalPersistencePath } from "./dev/get-local-persistence-path";
import registerDevHotKeys from "./dev/hotkeys";
import { maybeRegisterLocalWorker } from "./dev/local";
import { startDevServer } from "./dev/start-server";
import { UserError } from "./errors";
import { run } from "./experimental-flags";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { debounce } from "./pages/utils";
import { getLegacyAssetPaths, getSiteAssetPaths } from "./sites";
import {
	getAccountFromCache,
	loginOrRefreshIfRequired,
	requireApiToken,
	requireAuth,
} from "./user";
import {
	collectKeyValues,
	collectPlainTextVars,
} from "./utils/collectKeyValues";
import { memoizeGetPort } from "./utils/memoizeGetPort";
import { mergeWithOverride } from "./utils/mergeWithOverride";
import { getHostFromRoute, getZoneIdForPreview } from "./zones";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
	getDevCompatibilityDate,
	getRules,
	getScriptName,
	isLegacyEnv,
	printWranglerBanner,
} from "./index";
import type {
	ProxyData,
	ReloadCompleteEvent,
	StartDevWorkerInput,
	Trigger,
} from "./api";
import type { Config, Environment } from "./config";
import type {
	EnvironmentNonInheritable,
	Route,
	Rule,
} from "./config/environment";
import type { CfModule, CfWorkerInit } from "./deployment-bundle/worker";
import type { WorkerRegistry } from "./dev-registry";
import type { LoggerLevel } from "./logger";
import type { EnablePagesAssetsServiceBindingOptions } from "./miniflare-cli/types";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "./yargs-types";
import type { Json } from "miniflare";
import type React from "react";

export function devOptions(yargs: CommonYargsArgv) {
	return (
		yargs
			.positional("script", {
				describe: "The path to an entry point for your worker",
				type: "string",
			})
			.option("name", {
				describe: "Name of the worker",
				type: "string",
				requiresArg: true,
			})
			.option("compatibility-date", {
				describe: "Date to use for compatibility checks",
				type: "string",
				requiresArg: true,
			})
			.option("compatibility-flags", {
				describe: "Flags to use for compatibility checks",
				alias: "compatibility-flag",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("latest", {
				describe: "Use the latest version of the worker runtime",
				type: "boolean",
				default: true,
			})
			.option("assets", {
				describe: "Static assets to be served. Replaces Workers Sites.",
				type: "string",
				requiresArg: true,
			})
			// We want to have a --no-bundle flag, but yargs requires that
			// we also have a --bundle flag (that it adds the --no to by itself)
			// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
			// that's visible to the user but doesn't "do" anything.
			.option("bundle", {
				describe: "Run wrangler's compilation step before publishing",
				type: "boolean",
				hidden: true,
			})
			.option("no-bundle", {
				describe: "Skip internal build steps and directly deploy script",
				type: "boolean",
				default: false,
			})
			.option("format", {
				choices: ["modules", "service-worker"] as const,
				describe: "Choose an entry type",
				hidden: true,
				deprecated: true,
			})
			.option("ip", {
				describe: "IP address to listen on",
				type: "string",
			})
			.option("port", {
				describe: "Port to listen on",
				type: "number",
			})
			.option("inspector-port", {
				describe: "Port for devtools to connect to",
				type: "number",
			})
			.option("routes", {
				describe: "Routes to upload",
				alias: "route",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("host", {
				type: "string",
				requiresArg: true,
				describe:
					"Host to forward requests to, defaults to the zone of project",
			})
			.option("local-protocol", {
				describe: "Protocol to listen to requests on, defaults to http.",
				choices: ["http", "https"] as const,
			})
			.option("https-key-path", {
				describe: "Path to a custom certificate key",
				type: "string",
				requiresArg: true,
			})
			.option("https-cert-path", {
				describe: "Path to a custom certificate",
				type: "string",
				requiresArg: true,
			})
			.options("local-upstream", {
				type: "string",
				describe:
					"Host to act as origin in local mode, defaults to dev.host or route",
			})
			.option("experimental-public", {
				describe: "(Deprecated) Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("legacy-assets", {
				describe: "Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})

			.option("public", {
				describe: "(Deprecated) Static assets to be served",
				type: "string",
				requiresArg: true,
				deprecated: true,
				hidden: true,
			})
			.option("site", {
				describe: "Root folder of static assets for Workers Sites",
				type: "string",
				requiresArg: true,
				hidden: true,
				deprecated: true,
			})
			.option("site-include", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
				hidden: true,
				deprecated: true,
			})
			.option("site-exclude", {
				describe:
					"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
				type: "string",
				requiresArg: true,
				array: true,
				hidden: true,
				deprecated: true,
			})
			.option("upstream-protocol", {
				describe: "Protocol to forward requests to host on, defaults to https.",
				choices: ["http", "https"] as const,
			})
			.option("var", {
				describe:
					"A key-value pair to be injected into the script as a variable",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("define", {
				describe: "A key-value pair to be substituted in the script",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("alias", {
				describe: "A module pair to be substituted in the script",
				type: "string",
				requiresArg: true,
				array: true,
			})
			.option("jsx-factory", {
				describe: "The function that is called for each JSX element",
				type: "string",
				requiresArg: true,
			})
			.option("jsx-fragment", {
				describe: "The function that is called for each JSX fragment",
				type: "string",
				requiresArg: true,
			})
			.option("tsconfig", {
				describe: "Path to a custom tsconfig.json file",
				type: "string",
				requiresArg: true,
			})
			.option("remote", {
				alias: "r",
				describe:
					"Run on the global Cloudflare network with access to production resources",
				type: "boolean",
				default: false,
			})
			.option("local", {
				alias: "l",
				describe: "Run on my machine",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("experimental-local", {
				describe: "Run on my machine using the Cloudflare Workers runtime",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("minify", {
				describe: "Minify the script",
				type: "boolean",
			})
			.option("node-compat", {
				describe: "Enable Node.js compatibility",
				type: "boolean",
			})
			.option("experimental-enable-local-persistence", {
				describe:
					"Enable persistence for local mode (deprecated, use --persist)",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("persist-to", {
				describe:
					"Specify directory to use for local persistence (defaults to .wrangler/state)",
				type: "string",
				requiresArg: true,
			})
			.option("live-reload", {
				describe:
					"Auto reload HTML pages when change is detected in local mode",
				type: "boolean",
			})
			.check((argv) => {
				if (argv["live-reload"] && argv.remote) {
					throw new UserError(
						"--live-reload is only supported in local mode. Please just use one of either --remote or --live-reload."
					);
				}
				return true;
			})
			.option("inspect", {
				describe: "Enable dev tools",
				type: "boolean",
				deprecated: true,
				hidden: true,
			})
			.option("legacy-env", {
				type: "boolean",
				describe: "Use legacy environments",
				hidden: true,
			})
			.option("test-scheduled", {
				describe: "Test scheduled events by visiting /__scheduled in browser",
				type: "boolean",
				default: false,
			})
			.option("log-level", {
				choices: ["debug", "info", "log", "warn", "error", "none"] as const,
				describe: "Specify logging level",
				// Yargs requires this to type log-level properly
				default: "log" as LoggerLevel,
			})
			.option("show-interactive-dev-session", {
				describe:
					"Show interactive dev session  (defaults to true if the terminal supports interactivity)",
				type: "boolean",
			})
			.option("experimental-dev-env", {
				alias: ["x-dev-env"],
				type: "boolean",
				describe:
					"Use the experimental DevEnv instantiation (unified across wrangler dev and unstable_dev)",
				default: true,
			})
			.option("experimental-registry", {
				alias: ["x-registry"],
				type: "boolean",
				describe:
					"Use the experimental file based dev registry for multi-worker development",
				default: false,
			})
	);
}

type DevArguments = StrictYargsOptionsToInterface<typeof devOptions>;

export async function devHandler(args: DevArguments) {
	await printWranglerBanner();

	if (isWebContainer()) {
		logger.error(
			`Oh no! 😟 You tried to run \`wrangler dev\` in a StackBlitz WebContainer. 🤯
This is currently not supported 😭, but we think that we'll get it to work soon... hang in there! 🥺`
		);
		process.exitCode = 1;
		return;
	}

	if (args.remote) {
		const isLoggedIn = await loginOrRefreshIfRequired();
		if (!isLoggedIn) {
			throw new UserError(
				"You must be logged in to use wrangler dev in remote mode. Try logging in, or run wrangler dev --local."
			);
		}
	}

	if (args.legacyAssets) {
		logger.warn(
			`The --legacy-assets argument has been deprecated. Please use --assets instead.\n` +
				`To learn more about Workers with assets, visit our documentation at https://developers.cloudflare.com/workers/frameworks/.`
		);
	}

	// use separate watchers for config file and assets directory since
	// behaviour will be different between the two
	let configFileWatcher;
	let assetsWatcher;
	try {
		const devInstance = await run(
			{
				DEV_ENV: args.experimentalDevEnv,
				FILE_BASED_REGISTRY: args.experimentalRegistry,
				JSON_CONFIG_FILE: Boolean(args.experimentalJsonConfig),
			},
			() => startDev(args)
		);
		if (args.experimentalDevEnv) {
			assert(devInstance.devEnv !== undefined);
			await events.once(devInstance.devEnv, "teardown");
			if (devInstance.teardownRegistryPromise) {
				const teardownRegistry = await devInstance.teardownRegistryPromise;
				await teardownRegistry(devInstance.devEnv.config.latestConfig?.name);
			}
			devInstance.unregisterHotKeys?.();
		} else {
			assert(devInstance.devEnv === undefined);
			configFileWatcher = devInstance.configFileWatcher;
			assetsWatcher = devInstance.assetsWatcher;

			const { waitUntilExit } = devInstance.devReactElement;
			await waitUntilExit();
		}
	} finally {
		await Promise.allSettled([
			configFileWatcher?.close(),
			assetsWatcher?.close(),
		]);
	}
}

export type AdditionalDevProps = {
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id: string;
		preview_id?: string;
	}[];
	durableObjects?: {
		name: string;
		class_name: string;
		script_name?: string | undefined;
		environment?: string | undefined;
	}[];
	services?: {
		binding: string;
		service: string;
		environment?: string;
		entrypoint?: string;
	}[];
	r2?: {
		binding: string;
		bucket_name: string;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	ai?: {
		binding: string;
	};
	version_metadata?: {
		binding: string;
	};
	d1Databases?: Environment["d1_databases"];
	processEntrypoint?: boolean;
	additionalModules?: CfModule[];
	moduleRoot?: string;
	rules?: Rule[];
	showInteractiveDevSession?: boolean;
};

export type StartDevOptions = DevArguments &
	// These options can be passed in directly when called with the `wrangler.dev()` API.
	// They aren't exposed as CLI arguments.
	AdditionalDevProps & {
		forceLocal?: boolean;
		accountId?: string;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		onReady?: (ip: string, port: number, proxyData: ProxyData) => void;
	};

async function updateDevEnvRegistry(
	devEnv: DevEnv,
	registry: WorkerRegistry | undefined
) {
	let boundWorkers = await getBoundRegisteredWorkers(
		{
			name: devEnv.config.latestConfig?.name,
			services: extractBindingsOfType(
				"service",
				devEnv.config.latestConfig?.bindings
			),
			durableObjects: {
				bindings: extractBindingsOfType(
					"durable_object_namespace",
					devEnv.config.latestConfig?.bindings
				),
			},
		},
		registry
	);

	// Normalise an empty registry to undefined
	if (boundWorkers && Object.keys(boundWorkers).length === 0) {
		boundWorkers = undefined;
	}

	// Make sure we're not patching an empty config
	if (!devEnv.config.latestConfig) {
		await events.once(devEnv, "configUpdate");
	}

	// If the current bound workers in the registry are exactly the same as the workers defined in the config,
	// then we don't need to update anything.
	if (
		util.isDeepStrictEqual(
			boundWorkers,
			devEnv.config.latestConfig?.dev?.registry
		)
	) {
		return;
	}

	void devEnv.config.patch({
		dev: {
			...devEnv.config.latestConfig?.dev,
			registry: boundWorkers,
		},
	});
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
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const generateASSETSBinding = require("./miniflare-cli/assets").default;
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

export async function startDev(args: StartDevOptions) {
	let configFileWatcher: ReturnType<typeof watch> | undefined;
	let assetsWatcher: ReturnType<typeof watch> | undefined;
	let rerender: (node: React.ReactNode) => void | undefined;
	const devEnv = new DevEnv();
	let teardownRegistryPromise:
		| Promise<(name?: string) => Promise<void>>
		| undefined;

	let unregisterHotKeys: (() => void) | undefined;
	try {
		if (args.logLevel) {
			logger.loggerLevel = args.logLevel;
		}

		if (args.experimentalLocal) {
			logger.warn(
				"--experimental-local is no longer required and will be removed in a future version.\n`wrangler dev` now uses the local Cloudflare Workers runtime by default. 🎉"
			);
		}

		if (args.inspect) {
			//devtools are enabled by default, but we still need to disable them if the caller doesn't want them
			logger.warn(
				"Passing --inspect is unnecessary, now you can always connect to devtools."
			);
		}

		if (args.experimentalPublic) {
			throw new UserError(
				"The --experimental-public field has been deprecated, try --legacy-assets instead."
			);
		}

		if (args.public) {
			throw new UserError(
				"The --public field has been deprecated, try --legacy-assets instead."
			);
		}

		if (args.experimentalEnableLocalPersistence) {
			logger.warn(
				`--experimental-enable-local-persistence is deprecated.\n` +
					`Move any existing data to .wrangler/state and use --persist, or\n` +
					`use --persist-to=./wrangler-local-state to keep using the old path.`
			);
		}

		const configPath =
			args.config ||
			(args.script && findWranglerToml(path.dirname(args.script)));

		if (args.experimentalDevEnv) {
			// The ProxyWorker will have a stable host and port, so only listen for the first update
			void devEnv.proxy.ready.promise.then(({ url }) => {
				if (process.send && typeof vitest === "undefined") {
					process.send(
						JSON.stringify({
							event: "DEV_SERVER_READY",
							ip: url.hostname,
							port: parseInt(url.port),
						})
					);
				}
			});

			if (!args.disableDevRegistry) {
				teardownRegistryPromise = devRegistry((registry) =>
					updateDevEnvRegistry(devEnv, registry)
				);

				devEnv.runtimes.forEach((runtime) => {
					runtime.on(
						"reloadComplete",
						async (reloadEvent: ReloadCompleteEvent) => {
							if (!reloadEvent.config.dev?.remote) {
								const { url } = await devEnv.proxy.ready.promise;

								await maybeRegisterLocalWorker(
									url,
									reloadEvent.config.name,
									reloadEvent.proxyData.internalDurableObjects,
									reloadEvent.proxyData.entrypointAddresses
								);
							}
						}
					);
				});
			}

			if (isInteractive() && args.showInteractiveDevSession !== false) {
				unregisterHotKeys = registerDevHotKeys(devEnv, args);
			}

			await devEnv.config.set(
				{
					name: args.name,
					config: configPath,
					entrypoint: args.script,
					compatibilityDate: args.compatibilityDate,
					compatibilityFlags: args.compatibilityFlags,
					triggers: args.routes?.map<Extract<Trigger, { type: "route" }>>(
						(r) => ({
							type: "route",
							pattern: r,
						})
					),
					env: args.env,
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
								args.compatibilityFlags ??
									parsedConfig.compatibility_flags ??
									[],
								{
									nodeCompat: args.nodeCompat ?? parsedConfig.node_compat,
									noBundle: args.noBundle ?? parsedConfig.no_bundle,
								}
							),
					},
					bindings: {
						...(await getPagesAssetsFetcher(
							args.enablePagesAssetsServiceBinding
						)),
						...collectPlainTextVars(args.var),
						...convertCfWorkerInitBindingstoBindings({
							kv_namespaces: args.kv,
							vars: args.vars,
							send_email: undefined,
							wasm_modules: undefined,
							text_blobs: undefined,
							browser: undefined,
							ai: args.ai,
							version_metadata: args.version_metadata,
							data_blobs: undefined,
							durable_objects: { bindings: args.durableObjects ?? [] },
							queues: undefined,
							r2_buckets: args.r2,
							d1_databases: args.d1Databases,
							vectorize: undefined,
							hyperdrive: undefined,
							services: args.services,
							analytics_engine_datasets: undefined,
							dispatch_namespaces: undefined,
							mtls_certificates: undefined,
							pipelines: undefined,
							logfwdr: undefined,
							unsafe: undefined,
							assets: undefined,
						}),
					},
					dev: {
						auth: async () => {
							let accountId = args.accountId;
							if (!accountId) {
								unregisterHotKeys?.();
								accountId = await requireAuth({});
								unregisterHotKeys = registerDevHotKeys(devEnv, args);
							}
							return {
								accountId,
								apiToken: requireApiToken(),
							};
						},
						remote: !args.forceLocal && args.remote,
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
						registry: devEnv.config.latestConfig?.dev.registry,
					},
					legacy: {
						site: (configParam) => {
							const legacyAssetPaths = getResolvedLegacyAssetPaths(
								args,
								configParam
							);
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
						legacyAssets: (configParam) =>
							args.legacyAssets ?? configParam.legacy_assets,
						enableServiceEnvironments: !(args.legacyEnv ?? true),
					},
					assets: args.assets,
				} satisfies StartDevWorkerInput,
				true
			);

			void metrics.sendMetricsEvent(
				"run dev",
				{
					local: !args.remote,
					usesTypeScript: /\.tsx?$/.test(
						devEnv.config.latestConfig?.entrypoint as string
					),
				},
				{
					sendMetrics: devEnv.config.latestConfig?.sendMetrics,
					offline: !args.remote,
				}
			);

			return { devEnv, unregisterHotKeys, teardownRegistryPromise };
		} else {
			const projectRoot = configPath && path.dirname(configPath);
			let config = readConfig(configPath, args);

			if (
				(args.legacyAssets || config.legacy_assets) &&
				(args.site || config.site)
			) {
				throw new UserError(
					"Cannot use legacy assets and Workers Sites in the same Worker."
				);
			}

			if ((args.assets || config.assets) && args.remote) {
				throw new UserError(
					"Cannot use assets in remote mode. Workers with assets are only supported in local mode. Please use `wrangler dev`."
				);
			}

			validateAssetsArgsAndConfig(args, config);

			let assetsOptions = processAssetsArg(args, config);
			if (assetsOptions) {
				args.forceLocal = true;
			}

			if (config.configPath && !args.experimentalDevEnv) {
				configFileWatcher = watch(config.configPath, {
					persistent: true,
				}).on("change", async (_event) => {
					try {
						// TODO: Do we need to handle different `_event` types differently?
						// e.g. what if the file is deleted, or added?
						config = readConfig(configPath, args);
						if (!config.configPath) {
							return;
						}

						logger.log(`${path.basename(config.configPath)} changed...`);

						// ensure we reflect config changes in the `main` entry point
						entry = await getEntry(
							{
								legacyAssets: args.legacyAssets,
								script: args.script,
								moduleRoot: args.moduleRoot,
								assets: args.assets,
							},
							config,
							"dev"
						);

						// ensure we re-validate routes
						await getHostAndRoutes(args, config);

						assetsOptions = processAssetsArg(args, config);

						/*
						 * Handle static assets watching on config file changes
						 *
						 * 1. if assets was specified via CLI args, only config file
						 *    changes related to `main` will matter. In this case, re-running
						 *    `processAssetsArg` is enough (see above)
						 * 2. if assets was not specififed via the configuration
						 *    file, but it is now, we should start watching the assets
						 *    directory
						 * 3. if assets was specified via the configuration
						 *    file, we should ensure we're still watching the correct
						 *    directory
						 */
						if (assetsOptions && !args.assets) {
							await assetsWatcher?.close();

							if (assetsOptions) {
								const debouncedRerender = debounce(async () => {
									rerender(await getDevReactElement(config));
								}, 100);

								assetsWatcher = watch(assetsOptions.directory, {
									persistent: true,
									ignoreInitial: true,
								}).on("all", async (eventName, changedPath) => {
									const message = getAssetChangeMessage(eventName, changedPath);

									logger.debug(`🌀 ${message}...`);
									debouncedRerender();
								});
							}
						}

						rerender(await getDevReactElement(config));
					} catch (err) {
						logger.error(err);
					}
				});
			}

			const devServerSettings = await validateDevServerSettings(args, config);
			let { entry } = devServerSettings;
			const {
				upstreamProtocol,
				host,
				routes,
				getLocalPort,
				getInspectorPort,
				getRuntimeInspectorPort,
				cliDefines,
				cliAlias,
				localPersistencePath,
				processEntrypoint,
				additionalModules,
			} = devServerSettings;

			const nodejsCompatMode = validateNodeCompatMode(
				args.compatibilityDate ?? config.compatibility_date,
				args.compatibilityFlags ?? config.compatibility_flags ?? [],
				{
					nodeCompat: args.nodeCompat ?? config.node_compat,
					noBundle: args.noBundle ?? config.no_bundle,
				}
			);

			void metrics.sendMetricsEvent(
				"run dev",
				{
					local: !args.remote,
					usesTypeScript: /\.tsx?$/.test(entry.file),
				},
				{ sendMetrics: config.send_metrics, offline: !args.remote }
			);

			// eslint-disable-next-line no-inner-declarations
			async function getDevReactElement(configParam: Config) {
				const { legacyAssetPaths, bindings } = getBindingsAndLegacyAssetPaths(
					args,
					configParam
				);

				return (
					<Dev
						name={getScriptName(
							{ name: args.name, env: args.env },
							configParam
						)}
						noBundle={!(args.bundle ?? !configParam.no_bundle)}
						findAdditionalModules={configParam.find_additional_modules}
						entry={entry}
						env={args.env}
						host={host}
						routes={routes}
						processEntrypoint={processEntrypoint}
						additionalModules={additionalModules}
						rules={args.rules ?? getRules(configParam)}
						legacyEnv={isLegacyEnv(configParam)}
						minify={args.minify ?? configParam.minify}
						nodejsCompatMode={nodejsCompatMode}
						build={configParam.build || {}}
						define={{ ...configParam.define, ...cliDefines }}
						alias={{ ...configParam.alias, ...cliAlias }}
						initialMode={args.remote ? "remote" : "local"}
						jsxFactory={args.jsxFactory || configParam.jsx_factory}
						jsxFragment={args.jsxFragment || configParam.jsx_fragment}
						tsconfig={args.tsconfig ?? configParam.tsconfig}
						upstreamProtocol={upstreamProtocol}
						localProtocol={args.localProtocol || configParam.dev.local_protocol}
						httpsKeyPath={args.httpsKeyPath}
						httpsCertPath={args.httpsCertPath}
						localUpstream={
							args.localUpstream ?? host ?? getInferredHost(routes)
						}
						localPersistencePath={localPersistencePath}
						liveReload={args.liveReload || false}
						accountId={
							args.accountId ??
							configParam.account_id ??
							getAccountFromCache()?.id
						}
						legacyAssetPaths={legacyAssetPaths}
						legacyAssetsConfig={configParam.legacy_assets}
						assets={assetsOptions}
						initialPort={
							args.port ?? configParam.dev.port ?? (await getLocalPort())
						}
						initialIp={args.ip || configParam.dev.ip}
						inspectorPort={
							args.inspectorPort ??
							configParam.dev.inspector_port ??
							(await getInspectorPort())
						}
						runtimeInspectorPort={await getRuntimeInspectorPort()}
						isWorkersSite={Boolean(args.site || configParam.site)}
						compatibilityDate={getDevCompatibilityDate(
							configParam,
							args.compatibilityDate
						)}
						compatibilityFlags={
							args.compatibilityFlags || configParam.compatibility_flags
						}
						usageModel={configParam.usage_model}
						bindings={bindings}
						migrations={configParam.migrations}
						crons={configParam.triggers.crons}
						queueConsumers={configParam.queues.consumers}
						onReady={args.onReady}
						inspect={args.inspect ?? true}
						showInteractiveDevSession={args.showInteractiveDevSession}
						forceLocal={args.forceLocal}
						enablePagesAssetsServiceBinding={
							args.enablePagesAssetsServiceBinding
						}
						firstPartyWorker={configParam.first_party_worker}
						sendMetrics={configParam.send_metrics}
						testScheduled={args.testScheduled}
						projectRoot={projectRoot}
						rawArgs={args}
						rawConfig={configParam}
						devEnv={devEnv}
					/>
				);
			}

			const devReactElement = render(await getDevReactElement(config));
			rerender = devReactElement.rerender;

			if (assetsOptions && !args.experimentalDevEnv) {
				const debouncedRerender = debounce(async () => {
					rerender(await getDevReactElement(config));
				}, 100);

				assetsWatcher = watch(assetsOptions.directory, {
					persistent: true,
					ignoreInitial: true,
				}).on("all", async (eventName, filePath) => {
					const message = getAssetChangeMessage(eventName, filePath);

					logger.debug(`🌀 ${message}...`);
					debouncedRerender();
				});
			}

			return {
				devReactElement,
				configFileWatcher,
				assetsWatcher,
				stop: async () => {
					devReactElement.unmount();
					await Promise.allSettled([
						configFileWatcher?.close(),
						assetsWatcher?.close(),
					]);
				},
			};
		}
	} catch (e) {
		await Promise.allSettled([
			configFileWatcher?.close(),
			assetsWatcher?.close(),
			devEnv.teardown(),
			(async () => {
				if (teardownRegistryPromise) {
					const teardownRegistry = await teardownRegistryPromise;
					await teardownRegistry(devEnv.config.latestConfig?.name);
				}
				unregisterHotKeys?.();
			})(),
		]);
		throw e;
	}
}

export async function startApiDev(args: StartDevOptions) {
	if (args.logLevel) {
		logger.loggerLevel = args.logLevel;
	}

	const configPath =
		args.config || (args.script && findWranglerToml(path.dirname(args.script)));
	const projectRoot = configPath && path.dirname(configPath);
	const config = readConfig(configPath, args);

	const {
		entry,
		upstreamProtocol,
		host,
		routes,
		getLocalPort,
		getInspectorPort,
		getRuntimeInspectorPort,
		cliDefines,
		cliAlias,
		localPersistencePath,
		processEntrypoint,
		additionalModules,
	} = await validateDevServerSettings(args, config);

	const nodejsCompatMode = validateNodeCompatMode(
		args.compatibilityDate ?? config.compatibility_date,
		args.compatibilityFlags ?? config.compatibility_flags,
		{
			nodeCompat: args.nodeCompat ?? config.node_compat,
			noBundle: args.noBundle ?? config.no_bundle,
		}
	);

	await metrics.sendMetricsEvent(
		"run dev (api)",
		{ local: !args.remote },
		{ sendMetrics: config.send_metrics, offline: !args.remote }
	);

	const devEnv = new DevEnv();
	if (!args.disableDevRegistry && args.experimentalDevEnv) {
		const teardownRegistryPromise = devRegistry((registry) =>
			updateDevEnvRegistry(devEnv, registry)
		);
		devEnv.once("teardown", async () => {
			const teardownRegistry = await teardownRegistryPromise;
			await teardownRegistry(devEnv.config.latestConfig?.name);
		});
		devEnv.runtimes.forEach((runtime) => {
			runtime.on("reloadComplete", async (reloadEvent: ReloadCompleteEvent) => {
				if (!reloadEvent.config.dev?.remote) {
					assert(devEnv.proxy.proxyWorker);
					const url = await devEnv.proxy.proxyWorker.ready;

					await maybeRegisterLocalWorker(
						url,
						reloadEvent.config.name,
						reloadEvent.proxyData.internalDurableObjects,
						reloadEvent.proxyData.entrypointAddresses
					);
				}
			});
		});
	}

	// eslint-disable-next-line no-inner-declarations
	async function getDevServer(configParam: Config) {
		const { legacyAssetPaths, bindings } = getBindingsAndLegacyAssetPaths(
			args,
			configParam
		);

		//if args.bundle is on, don't disable bundling
		//if there's no args.bundle, and configParam.no_bundle is on, disable bundling
		//otherwise, enable bundling
		const enableBundling = args.bundle ?? !configParam.no_bundle;
		return await startDevServer({
			name: getScriptName({ name: args.name, env: args.env }, configParam),
			noBundle: !enableBundling,
			findAdditionalModules: configParam.find_additional_modules,
			entry: entry,
			env: args.env,
			host: host,
			routes: routes,
			processEntrypoint,
			additionalModules,
			rules: args.rules ?? getRules(configParam),
			legacyEnv: isLegacyEnv(configParam),
			minify: args.minify ?? configParam.minify,
			nodejsCompatMode: nodejsCompatMode,
			build: configParam.build || {},
			define: { ...config.define, ...cliDefines },
			alias: { ...config.alias, ...cliAlias },
			initialMode: args.remote ? "remote" : "local",
			jsxFactory: args.jsxFactory ?? configParam.jsx_factory,
			jsxFragment: args.jsxFragment ?? configParam.jsx_fragment,
			tsconfig: args.tsconfig ?? configParam.tsconfig,
			upstreamProtocol: upstreamProtocol,
			localProtocol: args.localProtocol ?? configParam.dev.local_protocol,
			httpsKeyPath: args.httpsKeyPath,
			httpsCertPath: args.httpsCertPath,
			localUpstream: args.localUpstream ?? host ?? getInferredHost(routes),
			local: args.local ?? !args.remote,
			localPersistencePath,
			liveReload: args.liveReload ?? false,
			accountId:
				args.accountId ?? configParam.account_id ?? getAccountFromCache()?.id,
			legacyAssetPaths: legacyAssetPaths,
			legacyAssetsConfig: configParam.legacy_assets,
			assets: undefined,
			//port can be 0, which means to use a random port
			initialPort: args.port ?? configParam.dev.port ?? (await getLocalPort()),
			initialIp: args.ip ?? configParam.dev.ip,
			inspectorPort:
				args.inspectorPort ??
				configParam.dev.inspector_port ??
				(await getInspectorPort()),
			runtimeInspectorPort: await getRuntimeInspectorPort(),
			isWorkersSite: Boolean(args.site || configParam.site),
			compatibilityDate: getDevCompatibilityDate(
				config,
				// Only `compatibilityDate` will be set when using `unstable_dev`
				args.compatibilityDate
			),
			compatibilityFlags:
				args.compatibilityFlags ?? configParam.compatibility_flags,
			usageModel: configParam.usage_model,
			bindings: bindings,
			migrations: configParam.migrations,
			crons: configParam.triggers.crons,
			queueConsumers: configParam.queues.consumers,
			onReady: args.onReady,
			inspect: args.inspect ?? true,
			showInteractiveDevSession: args.showInteractiveDevSession,
			forceLocal: args.forceLocal,
			enablePagesAssetsServiceBinding: args.enablePagesAssetsServiceBinding,
			firstPartyWorker: configParam.first_party_worker,
			sendMetrics: configParam.send_metrics,
			testScheduled: args.testScheduled,
			disableDevRegistry: args.disableDevRegistry ?? false,
			projectRoot,
			experimentalDevEnv: args.experimentalDevEnv,
			rawArgs: args,
			rawConfig: configParam,
			devEnv,
		});
	}

	const devServer = await run(
		{
			DEV_ENV: args.experimentalDevEnv,
			FILE_BASED_REGISTRY: args.experimentalRegistry,
			JSON_CONFIG_FILE: Boolean(args.experimentalJsonConfig),
		},
		() => getDevServer(config)
	);
	if (!devServer) {
		const error = new Error("Failed to start dev server.");
		logger.error(error.message);
		throw error;
	}

	return {
		stop: async () => {
			await devServer.stop();
		},
	};
}

/**
 * mask anything that was overridden in .dev.vars
 * so that we don't log potential secrets into the terminal
 */
export function maskVars(
	bindings: CfWorkerInit["bindings"],
	configParam: Config
) {
	const maskedVars = { ...bindings.vars };
	for (const key of Object.keys(maskedVars)) {
		if (maskedVars[key] !== configParam.vars[key]) {
			// This means it was overridden in .dev.vars
			// so let's mask it
			maskedVars[key] = "(hidden)";
		}
	}
	return maskedVars;
}

export async function getHostAndRoutes(
	args:
		| Pick<StartDevOptions, "host" | "routes" | "assets">
		| {
				host?: string;
				routes?: Extract<Trigger, { type: "route" }>[];
				assets?: string;
		  },
	config: Pick<Config, "route" | "routes" | "assets"> & {
		dev: Pick<Config["dev"], "host">;
	}
) {
	// TODO: if worker_dev = false and no routes, then error (only for dev)
	// Compute zone info from the `host` and `route` args and config;
	const host = args.host || config.dev.host;
	const routes: Route[] | undefined = (
		args.routes ||
		(config.route && [config.route]) ||
		config.routes
	)?.map((r) => {
		if (typeof r !== "object") {
			return r;
		}
		if ("custom_domain" in r || "zone_id" in r || "zone_name" in r) {
			return r;
		} else {
			// Make sure we map SDW SimpleRoute types { type: "route", pattern: string } to string
			return r.pattern;
		}
	});
	if (routes) {
		validateRoutes(routes, Boolean(args.assets || config.assets));
	}
	return { host, routes };
}

export function getInferredHost(routes: Route[] | undefined) {
	if (routes?.length) {
		const firstRoute = routes[0];
		const host = getHostFromRoute(firstRoute);

		// TODO(consider): do we need really need to do this? I've added the condition to throw to match the previous implicit behaviour of `new URL()` throwing upon invalid URLs, but could we just continue here without an inferred host?
		if (host === undefined) {
			throw new UserError(
				`Cannot infer host from first route: ${JSON.stringify(
					firstRoute
				)}.\nYou can explicitly set the \`dev.host\` configuration in your wrangler.toml file, for example:

	\`\`\`
	[dev]
	host = "example.com"
	\`\`\`
`
			);
		}
		return host;
	}
}

export async function validateDevServerSettings(
	args: StartDevOptions,
	config: Config
) {
	const entry = await getEntry(
		{
			legacyAssets: args.legacyAssets,
			script: args.script,
			moduleRoot: args.moduleRoot,
			assets: args.assets,
		},
		config,
		"dev"
	);
	const { host, routes } = await getHostAndRoutes(args, config);
	// TODO: Remove this hack
	// This function throws if the zone ID can't be found given the provided host and routes
	// However, it's called as part of initialising a preview session, which is nested deep within
	// React/Ink and useEffect()s, which swallow the error and turn it into a logw. Because it's a non-recoverable user error,
	// we want it to exit the Wrangler process early to allow the user to fix it. Calling it here forces
	// the error to be thrown where it will correctly exit the Wrangler process
	if (args.remote) {
		const accountId = await requireAuth({
			account_id: args.accountId ?? config.account_id,
		});
		assert(accountId, "Account ID must be provided for remote dev");
		await getZoneIdForPreview({ host, routes, accountId });
	}
	const initialIp = args.ip || config.dev.ip;
	const initialIpListenCheck = initialIp === "*" ? "0.0.0.0" : initialIp;
	const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, initialIpListenCheck);
	const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");

	// Our inspector proxy server will be binding to the result of
	// `getInspectorPort`. If we attempted to bind workerd to the same inspector
	// port, we'd get a port already in use error. Therefore, generate a new port
	// for our runtime to bind its inspector service to.
	const getRuntimeInspectorPort = memoizeGetPort(0, "127.0.0.1");

	if (config.services && config.services.length > 0) {
		logger.warn(
			`This worker is bound to live services: ${config.services
				.map(
					(service) =>
						`${service.binding} (${service.service}${
							service.environment ? `@${service.environment}` : ""
						}${service.entrypoint ? `#${service.entrypoint}` : ""})`
				)
				.join(", ")}`
		);
	}

	const upstreamProtocol =
		args.upstreamProtocol ?? config.dev.upstream_protocol;
	if (upstreamProtocol === "http" && args.remote) {
		logger.warn(
			"Setting upstream-protocol to http is not currently supported for remote mode.\n" +
				"If this is required in your project, please add your use case to the following issue:\n" +
				"https://github.com/cloudflare/workers-sdk/issues/583."
		);
	}

	const localPersistencePath = getLocalPersistencePath(
		args.persistTo,
		config.configPath
	);

	const cliDefines = collectKeyValues(args.define);
	const cliAlias = collectKeyValues(args.alias);

	return {
		entry,
		upstreamProtocol,
		getLocalPort,
		getInspectorPort,
		getRuntimeInspectorPort,
		host,
		routes,
		cliDefines,
		cliAlias,
		localPersistencePath,
		processEntrypoint: !!args.processEntrypoint,
		additionalModules: args.additionalModules ?? [],
	};
}

export function getResolvedBindings(
	args: StartDevOptions,
	configParam: Config
) {
	const cliVars = collectKeyValues(args.var);

	// now log all available bindings into the terminal
	const bindings = getBindings(configParam, args.env, !args.remote, {
		kv: args.kv,
		vars: { ...args.vars, ...cliVars },
		durableObjects: args.durableObjects,
		r2: args.r2,
		services: args.services,
		d1Databases: args.d1Databases,
		ai: args.ai,
		version_metadata: args.version_metadata,
	});

	const maskedVars = maskVars(bindings, configParam);

	printBindings({
		...bindings,
		vars: maskedVars,
	});

	return bindings;
}

export function getResolvedLegacyAssetPaths(
	args: StartDevOptions,
	configParam: Config
) {
	const legacyAssetPaths =
		args.legacyAssets || configParam.legacy_assets
			? getLegacyAssetPaths(configParam, args.legacyAssets)
			: getSiteAssetPaths(
					configParam,
					args.site,
					args.siteInclude,
					args.siteExclude
				);
	return legacyAssetPaths;
}

export function getBindingsAndLegacyAssetPaths(
	args: StartDevOptions,
	configParam: Config
) {
	return {
		bindings: getResolvedBindings(args, configParam),
		legacyAssetPaths: getResolvedLegacyAssetPaths(args, configParam),
	};
}

export function getBindings(
	configParam: Config,
	env: string | undefined,
	local: boolean,
	args: AdditionalDevProps
): CfWorkerInit["bindings"] {
	/**
	 * In Pages, KV, DO, D1, R2, AI and service bindings can be specified as
	 * args to the `pages dev` command. These args will always take precedence
	 * over the configuration file, and therefore should override corresponding
	 * config in `wrangler.toml`.
	 */
	// merge KV bindings
	const kvConfig = (configParam.kv_namespaces || []).map(
		({ binding, preview_id, id }) => {
			// In remote `dev`, we make folks use a separate kv namespace called
			// `preview_id` instead of `id` so that they don't
			// break production data. So here we check that a `preview_id`
			// has actually been configured.
			// This whole block of code will be obsoleted in the future
			// when we have copy-on-write for previews on edge workers.
			if (!preview_id && !local) {
				// TODO: This error has to be a _lot_ better, ideally just asking
				// to create a preview namespace for the user automatically
				throw new UserError(
					`In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your wrangler.toml`
				); // Ugh, I really don't like this message very much
			}
			return {
				binding,
				id: preview_id ?? id,
			};
		}
	);
	const kvArgs = args.kv || [];
	const mergedKVBindings = mergeWithOverride(kvConfig, kvArgs, "binding");

	// merge DO bindings
	const doConfig = (configParam.durable_objects || { bindings: [] }).bindings;
	const doArgs = args.durableObjects || [];
	const mergedDOBindings = mergeWithOverride(doConfig, doArgs, "name");

	// merge D1 bindings
	const d1Config = (configParam.d1_databases ?? []).map((d1Db) => {
		const database_id = d1Db.preview_database_id
			? d1Db.preview_database_id
			: d1Db.database_id;

		if (local) {
			return { ...d1Db, database_id };
		}
		// if you have a preview_database_id, we'll use it, but we shouldn't force people to use it.
		if (!d1Db.preview_database_id && !process.env.NO_D1_WARNING) {
			logger.log(
				`--------------------\n💡 Recommendation: for development, use a preview D1 database rather than the one you'd use in production.\n💡 Create a new D1 database with "wrangler d1 create <name>" and add its id as preview_database_id to the d1_database "${d1Db.binding}" in your wrangler.toml\n--------------------\n`
			);
		}
		return { ...d1Db, database_id };
	});
	const d1Args = args.d1Databases || [];
	const mergedD1Bindings = mergeWithOverride(d1Config, d1Args, "binding");

	// merge R2 bindings
	const r2Config: EnvironmentNonInheritable["r2_buckets"] =
		configParam.r2_buckets?.map(
			({ binding, preview_bucket_name, bucket_name, jurisdiction }) => {
				// same idea as kv namespace preview id,
				// same copy-on-write TODO
				if (!preview_bucket_name && !local) {
					throw new UserError(
						`In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your wrangler.toml`
					);
				}
				return {
					binding,
					bucket_name: preview_bucket_name ?? bucket_name,
					jurisdiction,
				};
			}
		) || [];
	const r2Args = args.r2 || [];
	const mergedR2Bindings = mergeWithOverride(r2Config, r2Args, "binding");

	// merge service bindings
	const servicesConfig = configParam.services || [];
	const servicesArgs = args.services || [];
	const mergedServiceBindings = mergeWithOverride(
		servicesConfig,
		servicesArgs,
		"binding"
	);

	// Hyperdrive bindings
	const hyperdriveBindings = configParam.hyperdrive.map((hyperdrive) => {
		const connectionStringFromEnv =
			process.env[
				`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}`
			];
		if (!connectionStringFromEnv && !hyperdrive.localConnectionString) {
			throw new UserError(
				`When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality. Please setup Postgres locally and set the value of the 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to the Postgres connection string.`
			);
		}

		// If there is a non-empty connection string specified in the environment,
		// use that as our local connection string configuration.
		if (connectionStringFromEnv) {
			logger.log(
				`Found a non-empty WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING variable for binding. Hyperdrive will connect to this database during local development.`
			);
			hyperdrive.localConnectionString = connectionStringFromEnv;
		}

		return hyperdrive;
	});

	// Queues bindings ??
	const queuesBindings = [
		...(configParam.queues.producers || []).map((queue) => {
			return {
				binding: queue.binding,
				queue_name: queue.queue,
				delivery_delay: queue.delivery_delay,
			};
		}),
	];

	const bindings = {
		// top-level fields
		wasm_modules: configParam.wasm_modules,
		text_blobs: configParam.text_blobs,
		data_blobs: configParam.data_blobs,

		// inheritable fields
		dispatch_namespaces: configParam.dispatch_namespaces,
		logfwdr: configParam.logfwdr,

		// non-inheritable fields
		vars: {
			// Use a copy of combinedVars since we're modifying it later
			...getVarsForDev(configParam, env),
			...args.vars,
		},
		durable_objects: {
			bindings: mergedDOBindings,
		},
		kv_namespaces: mergedKVBindings,
		queues: queuesBindings,
		r2_buckets: mergedR2Bindings,
		d1_databases: mergedD1Bindings,
		vectorize: configParam.vectorize,
		hyperdrive: hyperdriveBindings,
		services: mergedServiceBindings,
		analytics_engine_datasets: configParam.analytics_engine_datasets,
		browser: configParam.browser,
		ai: args.ai || configParam.ai,
		version_metadata: args.version_metadata || configParam.version_metadata,
		unsafe: {
			bindings: configParam.unsafe.bindings,
			metadata: configParam.unsafe.metadata,
			capnp: configParam.unsafe.capnp,
		},
		mtls_certificates: configParam.mtls_certificates,
		pipelines: configParam.pipelines,
		send_email: configParam.send_email,
		assets: configParam.assets?.binding
			? { binding: configParam.assets?.binding }
			: undefined,
	};

	return bindings;
}

export function getAssetChangeMessage(
	eventName: "add" | "addDir" | "change" | "unlink" | "unlinkDir",
	assetPath: string
): string {
	let message = `${assetPath} changed`;
	switch (eventName) {
		case "add":
			message = `File ${assetPath} was added`;
			break;
		case "addDir":
			message = `Directory ${assetPath} was added`;
			break;
		case "unlink":
			message = `File ${assetPath} was removed`;
			break;
		case "unlinkDir":
			message = `Directory ${assetPath} was removed`;
			break;
	}

	return message;
}
