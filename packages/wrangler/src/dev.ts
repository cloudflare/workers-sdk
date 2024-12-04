import assert from "node:assert";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { isWebContainer } from "@webcontainer/env";
import { DevEnv } from "./api";
import { MultiworkerRuntimeController } from "./api/startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./api/startDevWorker/NoOpProxyController";
import {
	convertCfWorkerInitBindingstoBindings,
	extractBindingsOfType,
} from "./api/startDevWorker/utils";
import {
	configFileName,
	findWranglerConfig,
	formatConfigSnippet,
} from "./config";
import { createCommand } from "./core/create-command";
import { validateRoutes } from "./deploy/deploy";
import { validateNodeCompatMode } from "./deployment-bundle/node-compat";
import { devRegistry, getBoundRegisteredWorkers } from "./dev-registry";
import { getVarsForDev } from "./dev/dev-vars";
import registerDevHotKeys from "./dev/hotkeys";
import { maybeRegisterLocalWorker } from "./dev/local";
import { UserError } from "./errors";
import { run } from "./experimental-flags";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import { getLegacyAssetPaths, getSiteAssetPaths } from "./sites";
import { loginOrRefreshIfRequired, requireApiToken, requireAuth } from "./user";
import {
	collectKeyValues,
	collectPlainTextVars,
} from "./utils/collectKeyValues";
import { mergeWithOverride } from "./utils/mergeWithOverride";
import { getHostFromRoute } from "./zones";
import type {
	AsyncHook,
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
import type {
	CfKvNamespace,
	CfModule,
	CfWorkerInit,
} from "./deployment-bundle/worker";
import type { WorkerRegistry } from "./dev-registry";
import type { CfAccount } from "./dev/create-worker-preview";
import type { LoggerLevel } from "./logger";
import type { EnablePagesAssetsServiceBindingOptions } from "./miniflare-cli/types";
import type { watch } from "chokidar";
import type { Json } from "miniflare";

export const dev = createCommand({
	behaviour: {
		provideConfig: false,
	},
	metadata: {
		description: "👂 Start a local server for developing your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		"compatibility-date": {
			describe: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
		"compatibility-flags": {
			describe: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		latest: {
			describe: "Use the latest version of the Workers runtime",
			type: "boolean",
			default: true,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		// We want to have a --no-bundle flag, but yargs requires that
		// we also have a --bundle flag (that it adds the --no to by itself)
		// So we make a --bundle flag, but hide it, and then add a --no-bundle flag
		// that's visible to the user but doesn't "do" anything.
		bundle: {
			describe: "Run wrangler's compilation step before publishing",
			type: "boolean",
			hidden: true,
		},
		"no-bundle": {
			describe: "Skip internal build steps and directly deploy script",
			type: "boolean",
			default: false,
		},
		format: {
			choices: ["modules", "service-worker"] as const,
			describe: "Choose an entry type",
			hidden: true,
			deprecated: true,
		},
		ip: {
			describe: "IP address to listen on",
			type: "string",
		},
		port: {
			describe: "Port to listen on",
			type: "number",
		},
		"inspector-port": {
			describe: "Port for devtools to connect to",
			type: "number",
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		host: {
			type: "string",
			requiresArg: true,
			describe: "Host to forward requests to, defaults to the zone of project",
		},
		"local-protocol": {
			describe: "Protocol to listen to requests on, defaults to http.",
			choices: ["http", "https"] as const,
		},
		"https-key-path": {
			describe: "Path to a custom certificate key",
			type: "string",
			requiresArg: true,
		},
		"https-cert-path": {
			describe: "Path to a custom certificate",
			type: "string",
			requiresArg: true,
		},
		"local-upstream": {
			type: "string",
			describe:
				"Host to act as origin in local mode, defaults to dev.host or route",
		},
		"experimental-public": {
			describe: "(Deprecated) Static assets to be served",
			type: "string",
			requiresArg: true,
			deprecated: true,
			hidden: true,
		},
		"legacy-assets": {
			describe: "Static assets to be served",
			type: "string",
			requiresArg: true,
			deprecated: true,
			hidden: true,
		},
		public: {
			describe: "(Deprecated) Static assets to be served",
			type: "string",
			requiresArg: true,
			deprecated: true,
			hidden: true,
		},
		site: {
			describe: "Root folder of static assets for Workers Sites",
			type: "string",
			requiresArg: true,
			hidden: true,
			deprecated: true,
		},
		"site-include": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"site-exclude": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"upstream-protocol": {
			describe: "Protocol to forward requests to host on, defaults to https.",
			choices: ["http", "https"] as const,
		},
		var: {
			describe: "A key-value pair to be injected into the script as a variable",
			type: "string",
			requiresArg: true,
			array: true,
		},
		define: {
			describe: "A key-value pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		alias: {
			describe: "A module pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"jsx-factory": {
			describe: "The function that is called for each JSX element",
			type: "string",
			requiresArg: true,
		},
		"jsx-fragment": {
			describe: "The function that is called for each JSX fragment",
			type: "string",
			requiresArg: true,
		},
		tsconfig: {
			describe: "Path to a custom tsconfig.json file",
			type: "string",
			requiresArg: true,
		},
		remote: {
			alias: "r",
			describe:
				"Run on the global Cloudflare network with access to production resources",
			type: "boolean",
			default: false,
		},
		local: {
			alias: "l",
			describe: "Run on my machine",
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		"experimental-local": {
			describe: "Run on my machine using the Cloudflare Workers runtime",
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		minify: {
			describe: "Minify the script",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
		},
		"experimental-enable-local-persistence": {
			describe: "Enable persistence for local mode (deprecated, use --persist)",
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		"persist-to": {
			describe:
				"Specify directory to use for local persistence (defaults to .wrangler/state)",
			type: "string",
			requiresArg: true,
		},
		"live-reload": {
			describe: "Auto reload HTML pages when change is detected in local mode",
			type: "boolean",
		},
		inspect: {
			describe: "Enable dev tools",
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
		"test-scheduled": {
			describe: "Test scheduled events by visiting /__scheduled in browser",
			type: "boolean",
			default: false,
		},
		"log-level": {
			choices: ["debug", "info", "log", "warn", "error", "none"] as const,
			describe: "Specify logging level",
			// Yargs requires this to type log-level properly
			default: "log" as LoggerLevel,
		},
		"show-interactive-dev-session": {
			describe:
				"Show interactive dev session (defaults to true if the terminal supports interactivity)",
			type: "boolean",
		},
		"experimental-dev-env": {
			alias: ["x-dev-env"],
			type: "boolean",
			deprecated: true,
			hidden: true,
		},
		"experimental-registry": {
			alias: ["x-registry"],
			type: "boolean",
			describe:
				"Use the experimental file based dev registry for multi-worker development",
			default: true,
		},
		"experimental-vectorize-bind-to-prod": {
			type: "boolean",
			describe:
				"Bind to production Vectorize indexes in local development mode",
			default: false,
		},
	},
	async validateArgs(args) {
		if (args.liveReload && args.remote) {
			throw new UserError(
				"--live-reload is only supported in local mode. Please just use one of either --remote or --live-reload."
			);
		}
		if (args.experimentalDevEnv) {
			logger.warn(
				"--x-dev-env is now on by default and will be removed in a future version."
			);
		}

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
	},
	async handler(args) {
		const devInstance = await run(
			{
				FILE_BASED_REGISTRY: args.experimentalRegistry,
				MULTIWORKER: Array.isArray(args.config),
				RESOURCES_PROVISION: false,
			},
			() => startDev(args)
		);
		assert(devInstance.devEnv !== undefined);
		await events.once(devInstance.devEnv, "teardown");
		await Promise.all(devInstance.secondary.map((d) => d.teardown()));
		if (devInstance.teardownRegistryPromise) {
			const teardownRegistry = await devInstance.teardownRegistryPromise;
			await teardownRegistry(devInstance.devEnv.config.latestConfig?.name);
		}
		devInstance.unregisterHotKeys?.();
	},
});

export type AdditionalDevProps = {
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id?: string;
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
		bucket_name?: string;
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

type DevArguments = (typeof dev)["args"];

export type StartDevOptions = DevArguments &
	// These options can be passed in directly when called with the `wrangler.dev()` API.
	// They aren't exposed as CLI arguments.
	AdditionalDevProps & {
		forceLocal?: boolean;
		accountId?: string;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		onReady?: (ip: string, port: number) => void;
		enableIpc?: boolean;
	};

async function updateDevEnvRegistry(
	devEnv: DevEnv,
	registry: WorkerRegistry | undefined
) {
	// Make sure we're not patching an empty config
	if (!devEnv.config.latestConfig) {
		await events.once(devEnv.config, "configUpdate");
	}

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

async function setupDevEnv(
	devEnv: DevEnv,
	configPath: string | undefined,
	auth: AsyncHook<CfAccount, [Pick<Config, "account_id">]>,
	args: Partial<StartDevOptions> & { multiworkerPrimary?: boolean }
) {
	await devEnv.config.set(
		{
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
							nodeCompat: args.nodeCompat ?? parsedConfig.node_compat,
							noBundle: args.noBundle ?? parsedConfig.no_bundle,
						}
					),
			},
			bindings: {
				...(await getPagesAssetsFetcher(args.enablePagesAssetsServiceBinding)),
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
					workflows: undefined,
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
				auth,
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
				registry: args.disableDevRegistry
					? null
					: devEnv.config.latestConfig?.dev.registry,
				bindVectorizeToProd: args.experimentalVectorizeBindToProd,
				multiworkerPrimary: args.multiworkerPrimary,
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
	return devEnv;
}

export async function startDev(args: StartDevOptions) {
	let configFileWatcher: ReturnType<typeof watch> | undefined;
	let assetsWatcher: ReturnType<typeof watch> | undefined;
	let devEnv: DevEnv | DevEnv[] | undefined;
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
			(args.script && findWranglerConfig(path.dirname(args.script)));

		const authHook: AsyncHook<CfAccount, [Pick<Config, "account_id">]> = async (
			config
		) => {
			const hotkeysDisplayed = !!unregisterHotKeys;
			let accountId = args.accountId;
			if (!accountId) {
				unregisterHotKeys?.();
				accountId = await requireAuth(config);
				if (hotkeysDisplayed) {
					assert(devEnv !== undefined);
					unregisterHotKeys = registerDevHotKeys(
						Array.isArray(devEnv) ? devEnv[0] : devEnv,
						args
					);
				}
			}
			return {
				accountId,
				apiToken: requireApiToken(),
			};
		};

		if (Array.isArray(configPath)) {
			const runtime = new MultiworkerRuntimeController(configPath.length);

			const primaryDevEnv = new DevEnv({ runtimes: [runtime] });

			if (isInteractive() && args.showInteractiveDevSession !== false) {
				unregisterHotKeys = registerDevHotKeys(primaryDevEnv, args);
			}

			// Set up the primary DevEnv (the one that the ProxyController will connect to)
			devEnv = [
				await setupDevEnv(primaryDevEnv, configPath[0], authHook, {
					...args,
					disableDevRegistry: true,
					multiworkerPrimary: true,
				}),
			];

			// Set up all auxiliary DevEnvs
			devEnv.push(
				...(await Promise.all(
					(configPath as string[]).slice(1).map((c) => {
						return setupDevEnv(
							new DevEnv({
								runtimes: [runtime],
								proxy: new NoOpProxyController(),
							}),
							c,
							authHook,
							{
								disableDevRegistry: true,
								multiworkerPrimary: false,
							}
						);
					})
				))
			);
		} else {
			devEnv = new DevEnv();

			// The ProxyWorker will have a stable host and port, so only listen for the first update
			void devEnv.proxy.ready.promise.then(({ url }) => {
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
			});

			if (!args.disableDevRegistry) {
				teardownRegistryPromise = devRegistry((registry) => {
					assert(devEnv !== undefined && !Array.isArray(devEnv));
					void updateDevEnvRegistry(devEnv, registry);
				});

				devEnv.runtimes.forEach((runtime) => {
					runtime.on(
						"reloadComplete",
						async (reloadEvent: ReloadCompleteEvent) => {
							if (!reloadEvent.config.dev?.remote) {
								assert(devEnv !== undefined && !Array.isArray(devEnv));
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

			await setupDevEnv(devEnv, configPath, authHook, args);
		}

		return {
			devEnv: Array.isArray(devEnv) ? devEnv[0] : devEnv,
			secondary: Array.isArray(devEnv) ? devEnv.slice(1) : [],
			unregisterHotKeys,
			teardownRegistryPromise,
		};
	} catch (e) {
		await Promise.allSettled([
			configFileWatcher?.close(),
			assetsWatcher?.close(),
			...(Array.isArray(devEnv)
				? devEnv.map((d) => d.teardown())
				: [devEnv?.teardown()]),
			(async () => {
				if (teardownRegistryPromise) {
					assert(devEnv === undefined || !Array.isArray(devEnv));
					const teardownRegistry = await teardownRegistryPromise;
					await teardownRegistry(devEnv?.config.latestConfig?.name);
				}
				unregisterHotKeys?.();
			})(),
		]);
		throw e;
	}
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

export function getInferredHost(
	routes: Route[] | undefined,
	configPath: string | undefined
) {
	if (routes?.length) {
		const firstRoute = routes[0];
		const host = getHostFromRoute(firstRoute);

		// TODO(consider): do we need really need to do this? I've added the condition to throw to match the previous implicit behaviour of `new URL()` throwing upon invalid URLs, but could we just continue here without an inferred host?
		if (host === undefined) {
			throw new UserError(
				`Cannot infer host from first route: ${JSON.stringify(
					firstRoute
				)}.\nYou can explicitly set the \`dev.host\` configuration in your ${configFileName(configPath)} file, for example:

	\`\`\`
	${formatConfigSnippet(
		{
			dev: {
				host: "example.com",
			},
		},
		configPath
	)}
	\`\`\`
`
			);
		}
		return host;
	}
}

function getResolvedLegacyAssetPaths(
	args: Partial<StartDevOptions>,
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
	const kvConfig = (configParam.kv_namespaces || []).map<CfKvNamespace>(
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
					`In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv:namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your ${configFileName(configParam.configPath)} file`
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
				`--------------------\n💡 Recommendation: for development, use a preview D1 database rather than the one you'd use in production.\n💡 Create a new D1 database with "wrangler d1 create <name>" and add its id as preview_database_id to the d1_database "${d1Db.binding}" in your ${configFileName(configParam.configPath)} file\n--------------------\n`
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
						`In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your ${configFileName(configParam.configPath)} file`
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

	const bindings: CfWorkerInit["bindings"] = {
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
		workflows: configParam.workflows,
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
