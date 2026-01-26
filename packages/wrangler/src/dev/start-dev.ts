import assert from "node:assert";
import path from "node:path";
import { bold, green } from "@cloudflare/cli/colors";
import { generateContainerBuildId } from "@cloudflare/containers-shared";
import { getRegistryPath } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { DevEnv } from "../api";
import { MultiworkerRuntimeController } from "../api/startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "../api/startDevWorker/NoOpProxyController";
import { convertCfWorkerInitBindingsToBindings } from "../api/startDevWorker/utils";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import registerDevHotKeys from "../dev/hotkeys";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { getSiteAssetPaths } from "../sites";
import { requireApiToken, requireAuth } from "../user";
import {
	collectKeyValues,
	collectPlainTextVars,
} from "../utils/collectKeyValues";
import type { AsyncHook, StartDevWorkerInput, Trigger } from "../api";
import type { StartDevOptions } from "../dev";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { CfAccount } from "./create-worker-preview";
import type { Config } from "@cloudflare/workers-utils";
import type { watch } from "chokidar";

/**
 * Starts one (primary) or more (secondary) DevEnv environments given the `args`.
 */
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
						args,
						false
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
						Support for remote bindings in ${green("`wrangler dev`")} is now available as a replacement for ${green("`wrangler dev --remote`")}. Try it out now by running ${green("`wrangler dev`")} with the ${green("`remote`")} option enabled on your resources and let us know how it goes!
						This gives you access to remote resources in development while retaining all the usual benefits of local dev: fast iteration speed, breakpoint debugging, and more.

						Refer to https://developers.cloudflare.com/workers/development-testing/#remote-bindings for more information.`
				)
			);
		}

		if (Array.isArray(args.config)) {
			const numWorkers = args.config.length;
			const primaryDevEnv = new DevEnv({
				runtimeFactories: [
					(d) => new MultiworkerRuntimeController(d, numWorkers),
				],
			});

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
						const auxDevEnv = new DevEnv({
							runtimeFactories: [() => primaryDevEnv.runtimes[0]],
							proxyFactory: (d) => new NoOpProxyController(d),
						});
						return setupDevEnv(auxDevEnv, c, authHook, {
							disableDevRegistry: args.disableDevRegistry,
							multiworkerPrimary: false,
						});
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

			// Print scheduled worker warning with the actual public URL
			const allDevEnvs = [primaryDevEnv, ...secondary];
			const hasCrons = allDevEnvs.some(
				(env) =>
					env.config.latestConfig?.triggers?.some((t) => t.type === "cron") ??
					false
			);
			maybePrintScheduledWorkerWarning(hasCrons, !!args.testScheduled, url);
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
				useServiceEnvironments: !(args.legacyEnv ?? true),
			},
			assets: args.assets,
			experimental: {
				tailLogs: !!args.experimentalTailLogs,
			},
		} satisfies StartDevWorkerInput,
		true
	);
	return devEnv;
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

/**
 * Logs a warning about scheduled workers not being automatically triggered
 * during local development. This should be called after the server is ready
 * and the actual URL is known.
 */
function maybePrintScheduledWorkerWarning(
	hasCrons: boolean,
	testScheduled: boolean,
	url: URL
): void {
	if (!hasCrons || testScheduled) {
		return;
	}

	const host =
		url.hostname === "0.0.0.0" || url.hostname === "::"
			? "localhost"
			: url.hostname.includes(":")
				? `[${url.hostname}]`
				: url.hostname;
	const port = url.port;

	logger.once.warn(
		`Scheduled Workers are not automatically triggered during local development.\n` +
			`To manually trigger a scheduled event, run:\n` +
			`  curl "http://${host}:${port}/cdn-cgi/handler/scheduled"\n` +
			`For more details, see https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally`
	);
}
