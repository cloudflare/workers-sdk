import assert from "node:assert";
import events from "node:events";
import path from "node:path";
import { bold, green } from "@cloudflare/cli/colors";
import { generateContainerBuildId } from "@cloudflare/containers-shared";
import { isWebContainer } from "@webcontainer/env";
import dedent from "ts-dedent";
import { DevEnv } from "./api";
import { MultiworkerRuntimeController } from "./api/startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./api/startDevWorker/NoOpProxyController";
import { convertCfWorkerInitBindingsToBindings } from "./api/startDevWorker/utils";
import { getAssetsOptions } from "./assets";
import { configFileName, formatConfigSnippet } from "./config";
import { createCommand } from "./core/create-command";
import { validateRoutes } from "./deploy/deploy";
import { validateNodeCompatMode } from "./deployment-bundle/node-compat";
import { getVarsForDev } from "./dev/dev-vars";
import registerDevHotKeys from "./dev/hotkeys";
import { getRegistryPath } from "./environment-variables/misc-variables";
import { UserError } from "./errors";
import { getFlag } from "./experimental-flags";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import { getSiteAssetPaths } from "./sites";
import { requireApiToken, requireAuth } from "./user";
import {
	collectKeyValues,
	collectPlainTextVars,
} from "./utils/collectKeyValues";
import { mergeWithOverride } from "./utils/mergeWithOverride";
import { getHostFromRoute } from "./zones";
import type { AsyncHook, StartDevWorkerInput, Trigger } from "./api";
import type { Config, Environment } from "./config";
import type {
	EnvironmentNonInheritable,
	Route,
	Rule,
} from "./config/environment";
import type { INHERIT_SYMBOL } from "./deployment-bundle/bindings";
import type {
	CfD1Database,
	CfKvNamespace,
	CfModule,
	CfQueue,
	CfR2Bucket,
	CfService,
	CfWorkerInit,
} from "./deployment-bundle/worker";
import type { CfAccount } from "./dev/create-worker-preview";
import type { EnablePagesAssetsServiceBindingOptions } from "./miniflare-cli/types";
import type { watch } from "chokidar";
import type { Json } from "miniflare";

export const dev = createCommand({
	behaviour: {
		provideConfig: false,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: Array.isArray(args.config),
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			REMOTE_BINDINGS: args.experimentalRemoteBindings ?? false,
			DEPLOY_REMOTE_DIFF_CHECK: false,
		}),
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
		"enable-containers": {
			type: "boolean",
			describe: "Whether to build and enable containers during development",
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
		minify: {
			describe: "Minify the script",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
			hidden: true,
			deprecated: true,
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
		},
		"show-interactive-dev-session": {
			describe:
				"Show interactive dev session (defaults to true if the terminal supports interactivity)",
			type: "boolean",
		},
		"experimental-vectorize-bind-to-prod": {
			type: "boolean",
			describe:
				"Bind to production Vectorize indexes in local development mode",
			default: false,
		},
		"experimental-images-local-mode": {
			type: "boolean",
			describe:
				"Use a local lower-fidelity implementation of the Images binding",
			default: false,
		},
	},
	async validateArgs(args) {
		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`
			);
		}
		if (args.liveReload && args.remote) {
			throw new UserError(
				"--live-reload is only supported in local mode. Please just use one of either --remote or --live-reload."
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
	},
	async handler(args) {
		const devInstance = await startDev(args);
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
		id?: string | typeof INHERIT_SYMBOL;
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
		bucket_name?: string | typeof INHERIT_SYMBOL;
		preview_bucket_name?: string;
		jurisdiction?: string;
	}[];
	ai?: {
		binding: string;
	};
	version_metadata?: {
		binding: string;
	};
	d1Databases?: Array<
		Omit<Environment["d1_databases"][number], "database_id"> & {
			database_id?: string | typeof INHERIT_SYMBOL;
		}
	>;
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
		dockerPath?: string;
		containerEngine?: string;
	};

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
				...convertCfWorkerInitBindingsToBindings({
					kv_namespaces: args.kv,
					vars: args.vars,
					send_email: undefined,
					wasm_modules: undefined,
					text_blobs: undefined,
					browser: undefined,
					ai: args.ai,
					images: undefined,
					version_metadata: args.version_metadata,
					data_blobs: undefined,
					durable_objects: { bindings: args.durableObjects ?? [] },
					workflows: undefined,
					queues: undefined,
					r2_buckets: args.r2,
					d1_databases: args.d1Databases,
					vectorize: undefined,
					hyperdrive: undefined,
					secrets_store_secrets: undefined,
					unsafe_hello_world: undefined,
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
				registry: args.disableDevRegistry ? undefined : getRegistryPath(),
				bindVectorizeToProd: args.experimentalVectorizeBindToProd,
				imagesLocalMode: args.experimentalImagesLocalMode,
				multiworkerPrimary: args.multiworkerPrimary,
				enableContainers: args.enableContainers,
				dockerPath: args.dockerPath,
				// initialise with a random id
				containerBuildId: generateContainerBuildId(),
			},
			legacy: {
				site: (configParam) => {
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
						Array.isArray(devEnv) ? devEnv : [devEnv],
						args
					);
				}
			}
			return {
				accountId,
				apiToken: requireApiToken(),
			};
		};

		if (args.remote) {
			logger.log(
				bold(
					dedent`
						Support for remote bindings in ${green("`wrangler dev`")} is now available in public beta as a replacement for ${green("`wrangler dev --remote`")}. Try it out now by running ${green("`wrangler dev --x-remote-bindings`")} with the ${green("`experimental_remote`")} option enabled on your resources and let us know how it goes!
						This gives you access to remote resources in development while retaining all the usual benefits of local dev: fast iteration speed, breakpoint debugging, and more.

						Refer to https://developers.cloudflare.com/workers/development-testing/#remote-bindings for more information.`
				)
			);
		}

		if (Array.isArray(args.config)) {
			const runtime = new MultiworkerRuntimeController(args.config.length);

			const primaryDevEnv = new DevEnv({ runtimes: [runtime] });

			// Set up the primary DevEnv (the one that the ProxyController will connect to)
			devEnv = [
				await setupDevEnv(primaryDevEnv, args.config[0], authHook, {
					...args,
					multiworkerPrimary: true,
				}),
			];

			// Set up all auxiliary DevEnvs
			devEnv.push(
				...(await Promise.all(
					(args.config as string[]).slice(1).map((c) => {
						return setupDevEnv(
							new DevEnv({
								runtimes: [runtime],
								proxy: new NoOpProxyController(),
							}),
							c,
							authHook,
							{
								disableDevRegistry: args.disableDevRegistry,
								multiworkerPrimary: false,
							}
						);
					})
				))
			);
			if (isInteractive() && args.showInteractiveDevSession !== false) {
				unregisterHotKeys = registerDevHotKeys(devEnv, args);
			}
		} else {
			devEnv = new DevEnv();

			await setupDevEnv(devEnv, args.config, authHook, args);

			if (isInteractive() && args.showInteractiveDevSession !== false) {
				unregisterHotKeys = registerDevHotKeys([devEnv], args);
			}
		}

		const [primaryDevEnv, ...secondary] = Array.isArray(devEnv)
			? devEnv
			: [devEnv];

		// The ProxyWorker will have a stable host and port, so only listen for the first update
		void primaryDevEnv.proxy.ready.promise.then(({ url }) => {
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

		return {
			devEnv: primaryDevEnv,
			secondary,
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
	config: Config
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
		const assetOptions = getAssetsOptions({ assets: args.assets }, config);
		validateRoutes(routes, assetOptions);
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

/**
 * Gets the bindings for the Cloudflare Worker.
 *
 * @param configParam The loaded configuration.
 * @param env The environment to use, if any.
 * @param envFiles An array of paths, relative to the project directory, of .env files to load.
 * If `undefined` it defaults to the standard .env files from `getDefaultEnvFiles()`.
 * @param local Whether the dev server should run locally.
 * @param args Additional arguments for the dev server.
 * @param remoteBindingsEnabled Whether remote bindings are enabled, defaults to the value of the `REMOTE_BINDINGS` flag.
 * @returns The bindings for the Cloudflare Worker.
 */
export function getBindings(
	configParam: Config,
	env: string | undefined,
	envFiles: string[] | undefined,
	local: boolean,
	args: AdditionalDevProps,
	remoteBindingsEnabled = getFlag("REMOTE_BINDINGS")
): CfWorkerInit["bindings"] {
	/**
	 * In Pages, KV, DO, D1, R2, AI and service bindings can be specified as
	 * args to the `pages dev` command. These args will always take precedence
	 * over the configuration file, and therefore should override corresponding
	 * config in `wrangler.toml`.
	 */
	// merge KV bindings
	const kvConfig = (configParam.kv_namespaces || []).map<CfKvNamespace>(
		({ binding, preview_id, id, experimental_remote }) => {
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
					`In development, you should use a separate kv namespace than the one you'd use in production. Please create a new kv namespace with "wrangler kv namespace create <name> --preview" and add its id as preview_id to the kv_namespace "${binding}" in your ${configFileName(configParam.configPath)} file`,
					{
						telemetryMessage:
							"no preview kv namespace configured in remote dev",
					}
				); // Ugh, I really don't like this message very much
			}
			return {
				binding,
				id: preview_id ?? id,
				experimental_remote: remoteBindingsEnabled && experimental_remote,
			} satisfies CfKvNamespace;
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
			return {
				...d1Db,
				experimental_remote: remoteBindingsEnabled && d1Db.experimental_remote,
				database_id,
			} satisfies CfD1Database;
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
			({
				binding,
				preview_bucket_name,
				bucket_name,
				jurisdiction,
				experimental_remote,
			}) => {
				// same idea as kv namespace preview id,
				// same copy-on-write TODO
				if (!preview_bucket_name && !local) {
					throw new UserError(
						`In development, you should use a separate r2 bucket than the one you'd use in production. Please create a new r2 bucket with "wrangler r2 bucket create <name>" and add its name as preview_bucket_name to the r2_buckets "${binding}" in your ${configFileName(configParam.configPath)} file`,
						{
							telemetryMessage: "no preview r2 bucket configured in remote dev",
						}
					);
				}
				return {
					binding,
					bucket_name: preview_bucket_name ?? bucket_name,
					jurisdiction,
					experimental_remote: remoteBindingsEnabled && experimental_remote,
				} satisfies CfR2Bucket;
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
	).map(
		(service) =>
			({
				...service,
				experimental_remote:
					remoteBindingsEnabled &&
					"experimental_remote" in service &&
					!!service.experimental_remote,
			}) satisfies CfService
	);

	// Hyperdrive bindings
	const hyperdriveBindings = configParam.hyperdrive.map((hyperdrive) => {
		const connectionStringFromEnv =
			process.env[
				`WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}`
			];
		// only require a local connection string in the wrangler file or the env if not using dev --remote
		if (
			local &&
			connectionStringFromEnv === undefined &&
			hyperdrive.localConnectionString === undefined
		) {
			throw new UserError(
				`When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality. Please setup Postgres locally and set the value of the 'WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to the Postgres connection string.`,
				{ telemetryMessage: "no local hyperdrive connection string" }
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

	// Queues bindings
	const queuesBindings = [
		...(configParam.queues.producers || []).map((queue) => {
			return {
				binding: queue.binding,
				queue_name: queue.queue,
				delivery_delay: queue.delivery_delay,
				experimental_remote: remoteBindingsEnabled && queue.experimental_remote,
			} satisfies CfQueue;
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
			...getVarsForDev(
				configParam.userConfigPath,
				envFiles,
				configParam.vars,
				env
			),
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
		secrets_store_secrets: configParam.secrets_store_secrets,
		services: mergedServiceBindings,
		analytics_engine_datasets: configParam.analytics_engine_datasets,
		browser: configParam.browser,
		ai: args.ai || configParam.ai,
		images: configParam.images,
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
		unsafe_hello_world: configParam.unsafe_hello_world,
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
