import assert from "node:assert";
import path from "node:path";
import { resolveDockerHost } from "@cloudflare/containers-shared";
import { extractBindingsOfType } from "@cloudflare/deploy-helpers";
import {
	configFileName,
	formatConfigSnippet,
	getTodaysCompatDate,
	getDisableConfigWatching,
	getDockerPath,
	UserError,
} from "@cloudflare/workers-utils";
import { watch } from "chokidar";
import { getWorkerRegistry } from "miniflare";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../../assets";
import { fillOpenAPIConfiguration } from "../../cloudchamber/common";
import { readConfig, readNewConfig } from "../../config";
import { containersScope } from "../../containers";
import { getNormalizedContainerOptions } from "../../containers/config";
import { getEntry } from "../../deployment-bundle/entry";
import { getBindings, getHostAndRoutes, getInferredHost } from "../../dev";
import { getDurableObjectClassNameToUseSQLiteMap } from "../../dev/class-names-sqlite";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { getFlag } from "../../experimental-flags";
import { logger, runWithLogLevel } from "../../logger";
import { checkTypesDiff } from "../../type-generation/helpers";
import { regenerateNewConfigTypes } from "../../type-generation/new-config";
import {
	loginOrRefreshIfRequired,
	requireApiToken,
	requireAuth,
} from "../../user";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
} from "../../utils/constants";
import { getRules } from "../../utils/getRules";
import { getScriptName } from "../../utils/getScriptName";
import { memoizeGetPort } from "../../utils/memoizeGetPort";
import { printBindings } from "../../utils/print-bindings";
import { useServiceEnvironments } from "../../utils/useServiceEnvironments";
import { getZoneIdForPreview } from "../../zones";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { unwrapHook } from "./utils";
import type { NewConfig, ReadConfigCommandArgs } from "../../config";
import type { DevRegistryUpdateEvent } from "./events";
import type {
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
	WranglerStartDevWorkerInput,
} from "./types";
import type { LoginOrRefreshFailureReason } from "@cloudflare/workers-auth";
import type { CfUnsafe, Config } from "@cloudflare/workers-utils";
import type { WorkerRegistry } from "miniflare";

const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");
const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, "localhost");

async function resolveInspectorConfig(
	config: Config,
	input: WranglerStartDevWorkerInput
): Promise<StartDevWorkerOptions["dev"]["inspector"]> {
	if (input.dev?.inspector === false) {
		return false;
	}
	const hostname =
		input.dev?.inspector?.hostname ?? config.dev.inspector_ip ?? "127.0.0.1";
	const port =
		input.dev?.inspector?.port ??
		config.dev.inspector_port ??
		(await getInspectorPort(hostname));
	return {
		hostname,
		port,
	};
}

async function resolveDevConfig(
	config: Config,
	input: WranglerStartDevWorkerInput
): Promise<StartDevWorkerOptions["dev"]> {
	const auth = async () => {
		if (input.dev?.remote) {
			const result = await loginOrRefreshIfRequired(config);
			if (!result.loggedIn) {
				const errorMessage = getLoginOrRefreshFailureErrorMessage(
					input.dev.remote,
					result.reason
				);
				throw new UserError(errorMessage, {
					telemetryMessage: "api dev remote login required",
				});
			}
		}

		if (input.dev?.auth) {
			return unwrapHook(input.dev.auth, config);
		}

		return {
			accountId: await requireAuth(config),
			apiToken: requireApiToken(),
		};
	};

	const localPersistencePath = getLocalPersistencePath(
		input.dev?.persist,
		config
	);

	const { host, routes } = await getHostAndRoutes(
		{
			host: input.dev?.origin?.hostname,
			routes: input.triggers?.filter(
				(t): t is Extract<Trigger, { type: "route" }> => t.type === "route"
			),
			assets: input?.assets,
		},
		config
	);

	// TODO: Remove this hack once the React flow is removed
	// This function throws if the zone ID can't be found given the provided host and routes
	// However, it's called as part of initialising a preview session, which is nested deep within
	// React/Ink and useEffect()s in `--no-x-dev-env` mode which swallow the error and turn it into a logged warning.
	// Because it's a non-recoverable user error, we want it to exit the Wrangler process early to allow the user to fix it.
	// Calling it here forces the error to be thrown where it will correctly exit the Wrangler process.
	if (input.dev?.remote) {
		const { accountId } = await auth();
		assert(accountId, "Account ID must be provided for remote dev");
		await getZoneIdForPreview(config, { host, routes, accountId });
	}

	const initialIp = input.dev?.server?.hostname ?? config.dev.ip;

	const initialIpListenCheck = initialIp === "*" ? "0.0.0.0" : initialIp;

	const useContainers =
		config.dev.enable_containers && config.containers?.length;

	return {
		auth,
		remote: input.dev?.remote,
		server: {
			hostname: input.dev?.server?.hostname || config.dev.ip,
			port:
				input.dev?.server?.port ??
				config.dev.port ??
				(await getLocalPort(initialIpListenCheck)),
			secure:
				input.dev?.server?.secure ?? config.dev.local_protocol === "https",
			httpsKeyPath: input.dev?.server?.httpsKeyPath,
			httpsCertPath: input.dev?.server?.httpsCertPath,
		},
		inspector: await resolveInspectorConfig(config, input),
		origin: {
			secure:
				input.dev?.origin?.secure ?? config.dev.upstream_protocol === "https",
			hostname:
				host ??
				((input.dev?.inferOriginFromRoutes ?? true)
					? getInferredHost(routes, config.configPath)
					: undefined),
		},
		watch: input.dev?.watch,
		liveReload: input.dev?.liveReload || false,
		testScheduled: input.dev?.testScheduled,
		outboundService: input.dev?.outboundService,
		structuredLogsHandler: input.dev?.structuredLogsHandler,
		// absolute resolved path
		persist: localPersistencePath,
		registry: input.dev?.registry,
		multiworkerPrimary: input.dev?.multiworkerPrimary,
		inferOriginFromRoutes: input.dev?.inferOriginFromRoutes ?? true,
		routeRequestsByRoutes: input.dev?.routeRequestsByRoutes ?? false,
		enableContainers:
			input.dev?.enableContainers ?? config.dev.enable_containers,
		dockerPath: input.dev?.dockerPath ?? getDockerPath(),
		containerEngine: useContainers
			? (input.dev?.containerEngine ??
				config.dev.container_engine ??
				resolveDockerHost(input.dev?.dockerPath ?? getDockerPath()))
			: undefined,
		containerBuildId: input.dev?.containerBuildId,
		generateTypes: input.dev?.generateTypes ?? config.dev.generate_types,
		tunnel: input.dev?.tunnel,
	} satisfies StartDevWorkerOptions["dev"];
}

/**
 * Maps a {@link LoginOrRefreshFailureReason} to a user-facing error message
 * with actionable remediation steps (e.g. re-running `wrangler login`,
 * setting `CLOUDFLARE_API_TOKEN`, or falling back to local dev).
 *
 * @param remoteMode - The remote dev mode that was requested. When
 *   `"minimal"` (remote-bindings mode), the suggestion to fall back to
 *   `--local` dev is omitted because local dev is not a useful alternative.
 * @param failureReason - The specific {@link LoginOrRefreshFailureReason}
 *   that describes why login or token refresh could not succeed.
 * @returns A formatted error message string prefixed with a generic failure
 *   summary, followed by reason-specific guidance and a `wrangler whoami` tip.
 */
function getLoginOrRefreshFailureErrorMessage(
	remoteMode: boolean | "minimal",
	failureReason: LoginOrRefreshFailureReason
) {
	const errorMessagePrefix = "Could not start remote dev session.";
	const localFallback =
		remoteMode === "minimal"
			? "" // Remote bindings mode — local dev is not a useful fallback
			: "\n - Or use `wrangler dev --local` to develop locally (remote resources like KV, D1, etc. will use local simulators instead).";
	const whoamiTip =
		"\n\nYou can run `wrangler whoami` to check your current authentication status.";
	const errorMessageBodies = {
		"no-credentials-non-interactive":
			" No credentials found, and the environment is non-interactive so browser login cannot be started.\n" +
			"Either:\n" +
			" - Set a CLOUDFLARE_API_TOKEN environment variable\n" +
			` - Run \`wrangler login\` in an interactive terminal first${localFallback}${whoamiTip}`,
		"no-credentials-login-failed":
			" No credentials found and the login attempt was unsuccessful.\n" +
			"Either:\n" +
			` - Run \`wrangler login\` to try again${localFallback}${whoamiTip}`,
		"token-expired-non-interactive":
			" Your auth token has expired and could not be refreshed, and the environment is non-interactive so browser login cannot be started.\n" +
			"Either:\n" +
			" - Run `wrangler login` in an interactive terminal\n" +
			` - Set a CLOUDFLARE_API_TOKEN environment variable${localFallback}${whoamiTip}`,
		"token-expired-login-failed":
			" Your auth token has expired and could not be refreshed, and the login attempt was unsuccessful.\n" +
			"Either:\n" +
			` - Run \`wrangler login\` to try again${localFallback}${whoamiTip}`,
	};
	const errorMessageBody = errorMessageBodies[failureReason];
	const errorMessage = errorMessagePrefix + errorMessageBody;
	return errorMessage;
}

async function resolveBindings(
	config: Config,
	input: StartDevWorkerInput
): Promise<{
	bindings: StartDevWorkerOptions["bindings"];
	unsafe?: CfUnsafe;
	printCurrentBindings: (registry: WorkerRegistry | null) => void;
}> {
	const bindings = getBindings(
		config,
		input.env,
		input.envFiles,
		!input.dev?.remote,
		input.bindings,
		input.defaultBindings
	);

	// Create a print function that captures the current bindings context
	const printCurrentBindings = (registry: WorkerRegistry | null) => {
		printBindings(
			bindings,
			input.tailConsumers ?? config.tail_consumers,
			input.streamingTailConsumers ?? config.streaming_tail_consumers,
			config.containers,
			{
				registry,
				local: !input.dev?.remote,
				isMultiWorker: getFlag("MULTIWORKER"),
				remoteBindingsDisabled: input.dev?.remote === false,
				name: config.name,
			}
		);
	};

	// Print the initial bindings table
	printCurrentBindings(
		input.dev?.registry ? getWorkerRegistry(input.dev.registry) : null
	);

	return {
		bindings: {
			...input.bindings,
			...bindings,
		},
		unsafe: {
			bindings: config.unsafe.bindings,
			metadata: config.unsafe.metadata,
			capnp: config.unsafe.capnp,
		},
		printCurrentBindings,
	};
}

async function resolveTriggers(
	config: Config,
	input: StartDevWorkerInput
): Promise<StartDevWorkerOptions["triggers"]> {
	const { routes } = await getHostAndRoutes(
		{
			host: input.dev?.origin?.hostname,
			routes: input.triggers?.filter(
				(t): t is Extract<Trigger, { type: "route" }> => t.type === "route"
			),
			assets: input?.assets,
		},
		config
	);

	const devRoutes =
		routes?.map<Extract<Trigger, { type: "route" }>>((r) =>
			typeof r === "string"
				? {
						type: "route",
						pattern: r,
					}
				: { type: "route", ...r }
		) ?? [];
	const queueConsumers =
		config.queues.consumers?.map<Extract<Trigger, { type: "queue-consumer" }>>(
			(c) => ({
				...c,
				type: "queue-consumer",
			})
		) ?? [];

	const crons =
		config.triggers.crons?.map<Extract<Trigger, { type: "cron" }>>((c) => ({
			cron: c,
			type: "cron",
		})) ?? [];

	return [...devRoutes, ...queueConsumers, ...crons];
}

async function resolveConfig(
	config: Config,
	input: StartDevWorkerInput,
	// If the worker name was previously autogenerated, keep the same one
	previousName: string | undefined,
	newConfigEnabled: boolean
): Promise<{
	config: StartDevWorkerOptions;
	printCurrentBindings: (registry: WorkerRegistry | null) => void;
}> {
	if (
		config.pages_build_output_dir &&
		input.dev?.multiworkerPrimary === false
	) {
		throw new UserError(
			`You cannot use a Pages project as a service binding target.\nIf you are trying to develop Pages and Workers together, please use \`wrangler pages dev\`. Note the first config file specified must be for the Pages project`,
			{ telemetryMessage: "api dev pages service binding target invalid" }
		);
	}
	const legacySite = unwrapHook(input.legacy?.site, config);

	const entry = await getEntry(
		{
			script: input.entrypoint,
			moduleRoot: input.build?.moduleRoot,
			// getEntry only needs to know if assets was specified.
			// The actual value is not relevant here, which is why not passing
			// the entire Assets object is fine.
			assets: input?.assets,
		},
		config,
		"dev"
	);

	const nodejsCompatMode = unwrapHook(input.build?.nodejsCompatMode, config);

	const { bindings, unsafe, printCurrentBindings } = await resolveBindings(
		config,
		input
	);

	const assetsOptions = getAssetsOptions({
		args: {
			assets: input?.assets,
			script: input.entrypoint,
		},
		config,
	});

	const resolved = {
		name:
			getScriptName({ name: input.name, env: input.env }, config) ??
			previousName ??
			crypto.randomUUID(),
		config: config.configPath,
		compatibilityDate: getDevCompatibilityDate(
			entry.projectRoot,
			config,
			input.compatibilityDate
		),
		compatibilityFlags: input.compatibilityFlags ?? config.compatibility_flags,
		complianceRegion: input.complianceRegion ?? config.compliance_region,
		pythonModules: {
			exclude: input.pythonModules?.exclude ?? config.python_modules.exclude,
		},
		entrypoint: entry.file,
		projectRoot: entry.projectRoot,
		bindings,
		migrations: input.migrations ?? config.migrations,
		sendMetrics: input.sendMetrics ?? config.send_metrics,
		triggers: await resolveTriggers(config, input),
		env: input.env,
		envFiles: input.envFiles,
		build: {
			alias: input.build?.alias ?? config.alias,
			additionalModules: input.build?.additionalModules ?? [],
			processEntrypoint: Boolean(input.build?.processEntrypoint),
			bundle: input.build?.bundle ?? !config.no_bundle,
			findAdditionalModules:
				input.build?.findAdditionalModules ?? config.find_additional_modules,
			moduleRoot: entry.moduleRoot,
			moduleRules: input.build?.moduleRules ?? getRules(config),

			minify: input.build?.minify ?? config.minify,
			keepNames: input.build?.keepNames ?? config.keep_names,
			define: { ...config.define, ...input.build?.define },
			custom: {
				command: input.build?.custom?.command ?? config.build?.command,
				watch: input.build?.custom?.watch ?? config.build?.watch_dir,
				workingDirectory:
					input.build?.custom?.workingDirectory ?? config.build?.cwd,
			},
			format: entry.format,
			nodejsCompatMode: nodejsCompatMode ?? null,
			jsxFactory: input.build?.jsxFactory || config.jsx_factory,
			jsxFragment: input.build?.jsxFragment || config.jsx_fragment,
			tsconfig: input.build?.tsconfig ?? config.tsconfig,
			exports: entry.exports,
		},
		containers: await getNormalizedContainerOptions(config, {}),
		dev: await resolveDevConfig(config, input),
		legacy: {
			site: legacySite,
			useServiceEnvironments:
				input.legacy?.useServiceEnvironments ?? useServiceEnvironments(config),
		},
		unsafe: {
			capnp: input.unsafe?.capnp ?? unsafe?.capnp,
			metadata: input.unsafe?.metadata ?? unsafe?.metadata,
		},
		assets: assetsOptions,
		tailConsumers: config.tail_consumers ?? [],
		experimental: {},
		streamingTailConsumers: config.streaming_tail_consumers ?? [],
	} satisfies StartDevWorkerOptions;

	if (
		extractBindingsOfType("analytics_engine", resolved.bindings).length &&
		!resolved.dev.remote &&
		resolved.build.format === "service-worker"
	) {
		logger.once.warn(
			"Analytics Engine is not supported locally when using the service-worker format. Please migrate to the module worker format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/"
		);
	}

	validateAssetsArgsAndConfig(resolved);

	const services = extractBindingsOfType("service", resolved.bindings);
	if (services && services.length > 0 && resolved.dev?.remote) {
		logger.once.warn(
			`This worker is bound to live services: ${services
				.map(
					(service) =>
						`${service.binding} (${service.service}${
							service.environment ? `@${service.environment}` : ""
						}${service.entrypoint ? `#${service.entrypoint}` : ""})`
				)
				.join(", ")}`
		);
	}

	if (!resolved.dev?.origin?.secure && resolved.dev?.remote) {
		logger.once.warn(
			"Setting upstream-protocol to http is not currently supported for remote mode.\n" +
				"If this is required in your project, please add your use case to the following issue:\n" +
				"https://github.com/cloudflare/workers-sdk/issues/583"
		);
	}

	// for pulling containers, we need to make sure the OpenAPI config for the
	// container API client is properly set so that we can get the correct permissions
	// from the cloudchamber API to pull from the repository.
	const needsPulling = resolved.containers.some(
		(c) => "image_uri" in c && c.image_uri
	);
	if (needsPulling && !resolved.dev.remote) {
		await fillOpenAPIConfiguration(config, containersScope);
	}

	// TODO(queues) support remote wrangler dev
	const queues = extractBindingsOfType("queue", resolved.bindings);
	if (
		resolved.dev.remote &&
		(queues?.length ||
			resolved.triggers?.some((t) => t.type === "queue-consumer"))
	) {
		logger.once.warn(
			"Queues are not yet supported in wrangler dev remote mode."
		);
	}

	if (resolved.dev.remote) {
		// We're in remote mode (`--remote`)

		if (
			resolved.dev.enableContainers &&
			resolved.containers &&
			resolved.containers.length > 0
		) {
			logger.once.warn(
				"Containers are only supported in local mode, to suppress this warning set `dev.enable_containers` to `false` or pass `--enable-containers=false` to the `wrangler dev` command"
			);
		}

		// TODO(do) support remote wrangler dev
		const classNameToUseSQLite = getDurableObjectClassNameToUseSQLiteMap(
			resolved.migrations
		);
		if (
			resolved.dev.remote &&
			Array.from(classNameToUseSQLite.values()).some((v) => v)
		) {
			logger.once.warn(
				"SQLite in Durable Objects is only supported in local mode."
			);
		}
	}

	// Skip the legacy `checkTypesDiff` call when `--experimental-new-config` is on.
	// The new-config equivalent (`regenerateNewConfigTypes`) is invoked from
	// `#updateConfig` directly using the structured `types` object returned
	// by `loadNewConfig`.
	if (!newConfigEnabled) {
		await checkTypesDiff(config, entry);
	}

	return { config: resolved, printCurrentBindings };
}

/**
 * Returns the compatibility date to use in development.
 *
 * When no compatibility date is configured, uses today's date.
 *
 * @param config wrangler configuration
 * @param compatibilityDate configured compatibility date
 * @returns the compatibility date to use in development
 */
function getDevCompatibilityDate(
	projectPath: string,
	config: Config | undefined,
	compatibilityDate = config?.compatibility_date
): string {
	const todaysDate = getTodaysCompatDate();

	if (config?.configPath && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using today's date: ${todaysDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: ${formatConfigSnippet({ compatibility_date: todaysDate }, config.configPath, false).trim()}, or\n` +
				`❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=${todaysDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? todaysDate;
}

export class ConfigController extends Controller {
	latestInput?: StartDevWorkerInput;
	latestConfig?: StartDevWorkerOptions;
	#printCurrentBindings?: (registry: WorkerRegistry | null) => void;

	#configWatcher?: ReturnType<typeof watch>;
	#abortController?: AbortController;

	async #ensureWatchingConfig(configPaths: string | string[] | undefined) {
		await this.#configWatcher?.close();
		if (configPaths === undefined) {
			return;
		}
		const paths = typeof configPaths === "string" ? [configPaths] : configPaths;
		if (paths.length === 0) {
			return;
		}
		this.#configWatcher = watch(paths, {
			persistent: true,
			ignoreInitial: true,
		}).on("change", async (changedPath) => {
			if (this.#configWatcher?.closed) {
				return;
			}
			logger.debug(`${path.basename(changedPath)} changed...`);
			assert(
				this.latestInput,
				"Cannot be watching config without having first set an input"
			);
			logger.debug("config file changed", changedPath);
			this.#updateConfig(this.latestInput).catch((err) => {
				this.emitErrorEvent({
					type: "error",
					reason: "Error resolving config after change",
					cause: castErrorCause(err),
					source: "ConfigController",
					data: undefined,
				});
			});
		});
	}

	public set(input: StartDevWorkerInput, throwErrors = false) {
		logger.debug("setting config");
		return runWithLogLevel(input.dev?.logLevel, () =>
			this.#updateConfig(input, throwErrors)
		);
	}
	public patch(input: Partial<StartDevWorkerInput>) {
		logger.debug("patching config");
		assert(
			this.latestInput,
			"Cannot call updateConfig without previously calling setConfig"
		);

		const config: StartDevWorkerInput = {
			...this.latestInput,
			...input,
		};

		return runWithLogLevel(config.dev?.logLevel, () =>
			this.#updateConfig(config)
		);
	}

	async #updateConfig(input: StartDevWorkerInput, throwErrors = false) {
		logger.debug(
			"Updating config...",
			this.#abortController?.signal,
			this.#configWatcher?.closed
		);
		this.#abortController?.abort();
		this.#abortController = new AbortController();
		const signal = this.#abortController.signal;
		this.latestInput = input;
		try {
			const newConfigEnabled = input.dev?.experimentalNewConfig === true;

			let newConfig: NewConfig | undefined;
			let fileConfig: Config;
			if (typeof input.config === "object") {
				fileConfig = input.config;
			} else {
				const readConfigArgs: ReadConfigCommandArgs = {
					script: input.entrypoint,
					config: input.config,
					env: input.env,
					"dispatch-namespace": undefined,
					"legacy-env": !input.legacy?.useServiceEnvironments,
					remote: !!input.dev?.remote,
					upstreamProtocol:
						input.dev?.origin?.secure === undefined
							? undefined
							: input.dev?.origin?.secure
								? "https"
								: "http",
					localProtocol:
						input.dev?.server?.secure === undefined
							? undefined
							: input.dev?.server?.secure
								? "https"
								: "http",
					generateTypes: input.dev?.generateTypes,
				};

				if (newConfigEnabled) {
					newConfig = await readNewConfig(readConfigArgs);
					fileConfig = newConfig.config;
				} else {
					fileConfig = readConfig(readConfigArgs, {
						useRedirectIfAvailable: true,
					});
				}
			}

			if (!getDisableConfigWatching() && input.dev?.watch !== false) {
				// Under `--experimental-new-config`, watch the transitive deps of both
				// `cloudflare.config.ts` and `wrangler.config.ts` (deduped, with
				// `node_modules` excluded by `@cloudflare/config`'s loader).
				// Otherwise fall back to the legacy single-file watch.
				const watchPaths = newConfig
					? Array.from(newConfig.dependencies)
					: fileConfig.configPath;
				await this.#ensureWatchingConfig(watchPaths);
			} else {
				await this.#configWatcher?.close();
				this.#configWatcher = undefined;
			}

			// Under `--experimental-new-config`, run the new-config type-gen path
			// instead of the legacy `checkTypesDiff`.
			if (newConfig && fileConfig.configPath) {
				await regenerateNewConfigTypes({
					cloudflareConfigPath: fileConfig.configPath,
					types: newConfig.types,
				});
			}

			const { config: resolvedConfig, printCurrentBindings } =
				await resolveConfig(
					fileConfig,
					input,
					this.latestConfig?.name,
					newConfigEnabled
				);

			if (signal.aborted) {
				return;
			}
			this.latestConfig = resolvedConfig;
			this.#printCurrentBindings = printCurrentBindings;
			this.emitConfigUpdateEvent(resolvedConfig);

			return this.latestConfig;
		} catch (err) {
			logger.debug("Error updating config", (err as Error).stack);
			if (signal.aborted) {
				logger.debug("Suppressing config error after signal aborted");

				return;
			}
			if (this.#configWatcher?.closed) {
				logger.debug("Suppressing config error after watcher closed");
				return;
			}
			if (throwErrors) {
				throw err;
			} else {
				this.emitErrorEvent({
					type: "error",
					reason: "Error resolving config",
					cause: castErrorCause(err),
					source: "ConfigController",
					data: undefined,
				});
			}
		}
	}

	// ******************
	//   Event Handlers
	// ******************
	onDevRegistryUpdate(event: DevRegistryUpdateEvent) {
		// Re-print the bindings table with updated registry information
		this.#printCurrentBindings?.(event.registry);
	}

	override async teardown() {
		logger.debug("ConfigController teardown beginning...");
		await super.teardown();
		this.#abortController?.abort();
		await this.#configWatcher?.close();
		logger.debug("ConfigController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(config: StartDevWorkerOptions) {
		this.bus.dispatch({ type: "configUpdate", config });
	}
}
