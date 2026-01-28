import assert from "node:assert";
import path from "node:path";
import { resolveDockerHost } from "@cloudflare/containers-shared";
import {
	configFileName,
	getDisableConfigWatching,
	getDockerPath,
	getLocalWorkerdCompatibilityDate,
	UserError,
} from "@cloudflare/workers-utils";
import { watch } from "chokidar";
import { getWorkerRegistry } from "miniflare";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../../assets";
import { fillOpenAPIConfiguration } from "../../cloudchamber/common";
import { readConfig } from "../../config";
import { containersScope } from "../../containers";
import { getNormalizedContainerOptions } from "../../containers/config";
import { getEntry } from "../../deployment-bundle/entry";
import {
	getBindings,
	getHostAndRoutes,
	getInferredHost,
	maskVars,
} from "../../dev";
import { getDurableObjectClassNameToUseSQLiteMap } from "../../dev/class-names-sqlite";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { logger, runWithLogLevel } from "../../logger";
import { checkTypesDiff } from "../../type-generation/helpers";
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
import {
	convertCfWorkerInitBindingsToBindings,
	extractBindingsOfType,
	unwrapHook,
} from "./utils";
import type { DevRegistryUpdateEvent } from "./events";
import type {
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
} from "./types";
import type { CfUnsafe, Config } from "@cloudflare/workers-utils";
import type { WorkerRegistry } from "miniflare";

const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");
const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, "localhost");

async function resolveInspectorConfig(
	config: Config,
	input: StartDevWorkerInput
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
	input: StartDevWorkerInput
): Promise<StartDevWorkerOptions["dev"]> {
	const auth = async () => {
		if (input.dev?.remote) {
			const isLoggedIn = await loginOrRefreshIfRequired(config);
			if (!isLoggedIn) {
				throw new UserError(
					"You must be logged in to use wrangler dev in remote mode. Try logging in, or run wrangler dev --local."
				);
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
			hostname: host ?? getInferredHost(routes, config.configPath),
		},
		liveReload: input.dev?.liveReload || false,
		testScheduled: input.dev?.testScheduled,
		// absolute resolved path
		persist: localPersistencePath,
		registry: input.dev?.registry,
		multiworkerPrimary: input.dev?.multiworkerPrimary,
		enableContainers:
			input.dev?.enableContainers ?? config.dev.enable_containers,
		dockerPath: input.dev?.dockerPath ?? getDockerPath(),
		containerEngine: useContainers
			? input.dev?.containerEngine ??
				config.dev.container_engine ??
				resolveDockerHost(input.dev?.dockerPath ?? getDockerPath())
			: undefined,
		containerBuildId: input.dev?.containerBuildId,
		generateTypes: input.dev?.generateTypes ?? config.dev.generate_types,
	} satisfies StartDevWorkerOptions["dev"];
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
		{
			kv: extractBindingsOfType("kv_namespace", input.bindings),
			vars: Object.fromEntries(
				extractBindingsOfType("plain_text", input.bindings).map((b) => [
					b.binding,
					b.value,
				])
			),
			durableObjects: extractBindingsOfType(
				"durable_object_namespace",
				input.bindings
			),
			r2: extractBindingsOfType("r2_bucket", input.bindings),
			services: extractBindingsOfType("service", input.bindings),
			d1Databases: extractBindingsOfType("d1", input.bindings),
			ai: extractBindingsOfType("ai", input.bindings)?.[0],
			version_metadata: extractBindingsOfType(
				"version_metadata",
				input.bindings
			)?.[0],
		}
	);

	// Create a print function that captures the current bindings context
	const printCurrentBindings = (registry: WorkerRegistry | null) => {
		const maskedVars = maskVars(bindings, config);

		printBindings(
			{
				...bindings,
				vars: maskedVars,
			},
			input.tailConsumers ?? config.tail_consumers,
			input.streamingTailConsumers ?? config.streaming_tail_consumers,
			config.containers,
			{
				registry,
				local: !input.dev?.remote,
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
			...convertCfWorkerInitBindingsToBindings(bindings),
		},
		unsafe: bindings.unsafe,
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
	input: StartDevWorkerInput
): Promise<{
	config: StartDevWorkerOptions;
	printCurrentBindings: (registry: WorkerRegistry | null) => void;
}> {
	if (
		config.pages_build_output_dir &&
		input.dev?.multiworkerPrimary === false
	) {
		throw new UserError(
			`You cannot use a Pages project as a service binding target.\nIf you are trying to develop Pages and Workers together, please use \`wrangler pages dev\`. Note the first config file specified must be for the Pages project`
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

	const assetsOptions = getAssetsOptions(
		{
			assets: input?.assets,
			script: input.entrypoint,
		},
		config
	);

	const resolved = {
		name:
			getScriptName({ name: input.name, env: input.env }, config) ?? "worker",
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
		experimental: {
			tailLogs: !!input.experimental?.tailLogs,
		},
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
						`${service.name} (${service.service}${
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
				"https://github.com/cloudflare/workers-sdk/issues/583."
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

	await checkTypesDiff(config, entry);

	return { config: resolved, printCurrentBindings };
}

/**
 * Returns the compatibility date to use in development.
 *
 * When no compatibility date is configured, uses the installed Workers runtime's latest supported date.
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
	const { date: workerdDate } = getLocalWorkerdCompatibilityDate({
		projectPath,
	});

	if (config?.configPath && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using the installed Workers runtime's latest supported date: ${workerdDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: compatibility_date = "${workerdDate}", or\n` +
				`❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=${workerdDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? workerdDate;
}

export class ConfigController extends Controller {
	latestInput?: StartDevWorkerInput;
	latestConfig?: StartDevWorkerOptions;
	#printCurrentBindings?: (registry: WorkerRegistry | null) => void;

	#configWatcher?: ReturnType<typeof watch>;
	#abortController?: AbortController;

	async #ensureWatchingConfig(configPath: string | undefined) {
		await this.#configWatcher?.close();
		if (configPath) {
			this.#configWatcher = watch(configPath, {
				persistent: true,
				ignoreInitial: true,
			}).on("change", async (_event) => {
				if (this.#configWatcher?.closed) {
					return;
				}
				logger.debug(`${path.basename(configPath)} changed...`);
				assert(
					this.latestInput,
					"Cannot be watching config without having first set an input"
				);
				logger.debug("config file changed", configPath);
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
			const fileConfig = readConfig(
				{
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
				},
				{ useRedirectIfAvailable: true }
			);

			if (!getDisableConfigWatching()) {
				await this.#ensureWatchingConfig(fileConfig.configPath);
			}

			const { config: resolvedConfig, printCurrentBindings } =
				await resolveConfig(fileConfig, input);

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
