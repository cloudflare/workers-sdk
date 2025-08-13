import assert from "node:assert";
import path from "node:path";
import { watch } from "chokidar";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../../assets";
import { readConfig } from "../../config";
import { getEntry } from "../../deployment-bundle/entry";
import {
	getBindings,
	getHostAndRoutes,
	getInferredHost,
	maskVars,
} from "../../dev";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireApiToken, requireAuth } from "../../user";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
} from "../../utils/constants";
import { getDevCompatibilityDate } from "../../utils/getDevCompatibilityDate";
import { getRules } from "../../utils/getRules";
import { getScriptName } from "../../utils/getScriptName";
import { isLegacyEnv } from "../../utils/isLegacyEnv";
import { memoizeGetPort } from "../../utils/memoizeGetPort";
import { printBindings } from "../../utils/print-bindings";
import { getZoneIdForPreview } from "../../zones";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import {
	convertCfWorkerInitBindingstoBindings,
	extractBindingsOfType,
	unwrapHook,
} from "./utils";
import type { Config } from "../../config";
import type { CfUnsafe } from "../../deployment-bundle/worker";
import type { ControllerEventMap } from "./BaseController";
import type { ConfigUpdateEvent } from "./events";
import type {
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Trigger,
} from "./types";

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
		const { accountId } = await unwrapHook(auth, config);
		assert(accountId, "Account ID must be provided for remote dev");
		await getZoneIdForPreview({ host, routes, accountId });
	}

	const initialIp = input.dev?.server?.hostname ?? config.dev.ip;

	const initialIpListenCheck = initialIp === "*" ? "0.0.0.0" : initialIp;

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
		inspector: {
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
	} satisfies StartDevWorkerOptions["dev"];
}

async function resolveBindings(
	config: Config,
	input: StartDevWorkerInput
): Promise<{ bindings: StartDevWorkerOptions["bindings"]; unsafe?: CfUnsafe }> {
	const bindings = getBindings(config, input.env, !input.dev?.remote, {
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
	});

	const maskedVars = maskVars(bindings, config);

	// now log all available bindings into the terminal
	printBindings(
		{
			...bindings,
			vars: maskedVars,
		},
		{
			registry: input.dev?.registry,
			local: !input.dev?.remote,
			imagesLocalMode: input.dev?.imagesLocalMode,
			name: config.name,
		}
	);

	return {
		bindings: {
			...input.bindings,
			...convertCfWorkerInitBindingstoBindings(bindings),
		},
		unsafe: bindings.unsafe,
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
): Promise<StartDevWorkerOptions> {
	if (
		config.pages_build_output_dir &&
		input.dev?.multiworkerPrimary === false
	) {
		throw new UserError(
			`You cannot use a Pages project as a service binding target.\nIf you are trying to develop Pages and Workers together, please use \`wrangler pages dev\`. Note the first config file specified must be for the Pages project`
		);
	}
	const legacySite = unwrapHook(input.legacy?.site, config);

	const legacyAssets = unwrapHook(input.legacy?.legacyAssets, config);

	const entry = await getEntry(
		{
			legacyAssets: Boolean(legacyAssets),
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

	const { bindings, unsafe } = await resolveBindings(config, input);

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
		entrypoint: entry.file,
		projectRoot: entry.projectRoot,
		bindings,
		migrations: input.migrations ?? config.migrations,
		sendMetrics: input.sendMetrics ?? config.send_metrics,
		triggers: await resolveTriggers(config, input),
		env: input.env,
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
		dev: await resolveDevConfig(config, input),
		legacy: {
			site: legacySite,
			legacyAssets: legacyAssets,
			enableServiceEnvironments:
				input.legacy?.enableServiceEnvironments ?? !isLegacyEnv(config),
		},
		unsafe: {
			capnp: input.unsafe?.capnp ?? unsafe?.capnp,
			metadata: input.unsafe?.metadata ?? unsafe?.metadata,
		},
		assets: assetsOptions,
	} satisfies StartDevWorkerOptions;

	if (resolved.legacy.legacyAssets && resolved.legacy.site) {
		throw new UserError(
			"Cannot use legacy assets and Workers Sites in the same Worker."
		);
	}

	if (
		extractBindingsOfType("browser", resolved.bindings).length &&
		!resolved.dev.remote
	) {
		throw new UserError(
			"Browser Rendering is not supported locally. Please use `wrangler dev --remote` instead."
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

	// TODO(queues) support remote wrangler dev
	const queues = extractBindingsOfType("queue", resolved.bindings);
	if (
		resolved.dev.remote &&
		(queues?.length ||
			resolved.triggers?.some((t) => t.type === "queue-consumer"))
	) {
		logger.warn("Queues are not yet supported in wrangler dev remote mode.");
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

	return resolved;
}
export class ConfigController extends Controller<ConfigControllerEventMap> {
	latestInput?: StartDevWorkerInput;
	latestConfig?: StartDevWorkerOptions;

	#configWatcher?: ReturnType<typeof watch>;
	#abortController?: AbortController;

	async #ensureWatchingConfig(configPath: string | undefined) {
		await this.#configWatcher?.close();
		if (configPath) {
			this.#configWatcher = watch(configPath, {
				persistent: true,
				ignoreInitial: true,
			}).on("change", async (_event) => {
				logger.log(`${path.basename(configPath)} changed...`);
				assert(
					this.latestInput,
					"Cannot be watching config without having first set an input"
				);
				void this.#updateConfig(this.latestInput);
			});
		}
	}

	public set(input: StartDevWorkerInput, throwErrors = false) {
		return this.#updateConfig(input, throwErrors);
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

		return this.#updateConfig(config);
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
					remote: input.dev?.remote,
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

			const resolvedConfig = await resolveConfig(fileConfig, input);
			if (signal.aborted) {
				return;
			}
			this.latestConfig = resolvedConfig;
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
