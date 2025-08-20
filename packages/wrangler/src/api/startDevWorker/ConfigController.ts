import assert from "node:assert";
import path from "node:path";
import { resolveDockerHost } from "@cloudflare/containers-shared";
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
import { getClassNamesWhichUseSQLite } from "../../dev/class-names-sqlite";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { getDockerPath } from "../../environment-variables/misc-variables";
import { UserError } from "../../errors";
import { getFlag } from "../../experimental-flags";
import { logger, runWithLogLevel } from "../../logger";
import { checkTypesDiff } from "../../type-generation/helpers";
import {
	loginOrRefreshIfRequired,
	requireApiToken,
	requireAuth,
} from "../../user";
import { getDevCompatibilityDate } from "../../utils/compatibility-date";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
} from "../../utils/constants";
import { getRules } from "../../utils/getRules";
import { getScriptName } from "../../utils/getScriptName";
import { isLegacyEnv } from "../../utils/isLegacyEnv";
import { memoizeGetPort } from "../../utils/memoizeGetPort";
import { printBindings } from "../../utils/print-bindings";
import { getZoneIdForPreview } from "../../zones";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import {
	convertCfWorkerInitBindingsToBindings,
	extractBindingsOfType,
	unwrapHook,
} from "./utils";
import type { Config } from "../../config";
import type { CfUnsafe } from "../../deployment-bundle/worker";
import type { ControllerEventMap } from "./BaseController";
import type { ConfigUpdateEvent, DevRegistryUpdateEvent } from "./events";
import type {
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
} from "./types";
import type { WorkerRegistry } from "miniflare";

type ConfigControllerEventMap = ControllerEventMap & {
	configUpdate: [ConfigUpdateEvent];
};

const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");
const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, "localhost");

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
		inspector:
			input.dev?.inspector === false
				? false
				: {
						port:
							input.dev?.inspector?.port ??
							config.dev.inspector_port ??
							(await getInspectorPort()),
					},
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
		bindVectorizeToProd: input.dev?.bindVectorizeToProd ?? false,
		multiworkerPrimary: input.dev?.multiworkerPrimary,
		imagesLocalMode: input.dev?.imagesLocalMode ?? false,
		experimentalRemoteBindings:
			input.dev?.experimentalRemoteBindings ?? getFlag("REMOTE_BINDINGS"),
		enableContainers:
			input.dev?.enableContainers ?? config.dev.enable_containers,
		dockerPath: input.dev?.dockerPath ?? getDockerPath(),
		containerEngine: useContainers
			? input.dev?.containerEngine ??
				config.dev.container_engine ??
				resolveDockerHost(input.dev?.dockerPath ?? getDockerPath())
			: undefined,
		containerBuildId: input.dev?.containerBuildId,
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
		},
		input.dev?.experimentalRemoteBindings
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
			{
				registry,
				local: !input.dev?.remote,
				imagesLocalMode: input.dev?.imagesLocalMode,
				name: config.name,
				vectorizeBindToProd: input.dev?.bindVectorizeToProd,
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
			// The actualy value is not relevant here, which is why not passing
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
		compatibilityDate: getDevCompatibilityDate(config, input.compatibilityDate),
		compatibilityFlags: input.compatibilityFlags ?? config.compatibility_flags,
		complianceRegion: input.complianceRegion ?? config.compliance_region,
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
			enableServiceEnvironments:
				input.legacy?.enableServiceEnvironments ?? !isLegacyEnv(config),
		},
		unsafe: {
			capnp: input.unsafe?.capnp ?? unsafe?.capnp,
			metadata: input.unsafe?.metadata ?? unsafe?.metadata,
		},
		assets: assetsOptions,
		tailConsumers: config.tail_consumers ?? [],
	} satisfies StartDevWorkerOptions;

	if (
		extractBindingsOfType("analytics_engine", resolved.bindings).length &&
		!resolved.dev.remote &&
		resolved.build.format === "service-worker"
	) {
		logger.warn(
			"Analytics Engine is not supported locally when using the service-worker format. Please migrate to the module worker format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/"
		);
	}

	validateAssetsArgsAndConfig(resolved);

	const services = extractBindingsOfType("service", resolved.bindings);
	if (services && services.length > 0 && resolved.dev?.remote) {
		logger.warn(
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
		logger.warn(
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
		logger.warn("Queues are not yet supported in wrangler dev remote mode.");
	}

	if (resolved.dev.remote) {
		// We're in remote mode (`--remote`)

		if (
			resolved.dev.enableContainers &&
			resolved.containers &&
			resolved.containers.length > 0
		) {
			logger.warn(
				"Containers are only supported in local mode, to suppress this warning set `dev.enable_containers` to `false` or pass `--enable-containers=false` to the `wrangler dev` command"
			);
		}

		// TODO(do) support remote wrangler dev
		const classNamesWhichUseSQLite = getClassNamesWhichUseSQLite(
			resolved.migrations
		);
		if (
			resolved.dev.remote &&
			Array.from(classNamesWhichUseSQLite.values()).some((v) => v)
		) {
			logger.warn("SQLite in Durable Objects is only supported in local mode.");
		}
	}

	// prompt user to update their types if we detect that it is out of date
	const typesChanged = await checkTypesDiff(config, entry);
	if (typesChanged) {
		logger.log(
			"❓ Your types might be out of date. Re-run `wrangler types` to ensure your types are correct."
		);
	}

	return { config: resolved, printCurrentBindings };
}

export class ConfigController extends Controller<ConfigControllerEventMap> {
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
				logger.debug(`${path.basename(configPath)} changed...`);
				assert(
					this.latestInput,
					"Cannot be watching config without having first set an input"
				);
				void this.#updateConfig(this.latestInput);
			});
		}
	}

	public set(input: StartDevWorkerInput, throwErrors = false) {
		return runWithLogLevel(input.dev?.logLevel, () =>
			this.#updateConfig(input, throwErrors)
		);
	}
	public patch(input: Partial<StartDevWorkerInput>) {
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
					"legacy-env": !input.legacy?.enableServiceEnvironments,
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
				},
				{ useRedirectIfAvailable: true }
			);

			if (typeof vitest === "undefined") {
				void this.#ensureWatchingConfig(fileConfig.configPath);
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

	async teardown() {
		logger.debug("ConfigController teardown beginning...");
		await this.#configWatcher?.close();
		logger.debug("ConfigController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(config: StartDevWorkerOptions) {
		this.emit("configUpdate", { type: "configUpdate", config });
	}
}
