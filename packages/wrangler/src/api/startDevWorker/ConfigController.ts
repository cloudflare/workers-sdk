import assert from "node:assert";
import path from "node:path";
import { watch } from "chokidar";
import {
	DEFAULT_INSPECTOR_PORT,
	DEFAULT_LOCAL_PORT,
	getDevCompatibilityDate,
	getRules,
	getScriptName,
	isLegacyEnv,
} from "../..";
import { printBindings, readConfig } from "../../config";
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
import { getAccountId, requireApiToken } from "../../user";
import { memoizeGetPort } from "../../utils/memoizeGetPort";
import { Controller } from "./BaseController";
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

export type ConfigControllerEventMap = ControllerEventMap & {
	configUpdate: [ConfigUpdateEvent];
};

const getInspectorPort = memoizeGetPort(DEFAULT_INSPECTOR_PORT, "127.0.0.1");
const getLocalPort = memoizeGetPort(DEFAULT_LOCAL_PORT, "localhost");

async function resolveDevConfig(
	config: Config,
	input: StartDevWorkerInput
): Promise<StartDevWorkerOptions["dev"]> {
	const localPersistencePath = getLocalPersistencePath(
		input.dev?.persist,
		config.configPath
	);

	const { host, routes } = await getHostAndRoutes(
		{
			host: input.dev?.origin?.hostname,
			routes: input.triggers?.filter(
				(t): t is Extract<Trigger, { type: "route" }> => t.type === "route"
			),
		},
		config
	);

	const initialIp = input.dev?.server?.hostname ?? config.dev.ip;

	const initialIpListenCheck = initialIp === "*" ? "0.0.0.0" : initialIp;

	return {
		auth:
			input.dev?.auth ??
			(async () => {
				return {
					accountId: await getAccountId(),
					apiToken: requireApiToken(),
				};
			}),
		remote: input.dev?.remote,
		server: {
			hostname: input.dev?.server?.hostname || config.dev.ip,
			port:
				input.dev?.server?.port ??
				config.dev.port ??
				(await getLocalPort(initialIpListenCheck)),
			secure:
				input.dev?.server?.secure || config.dev.local_protocol === "https",
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
				input.dev?.origin?.secure || config.dev.upstream_protocol === "https",
			hostname: host ?? getInferredHost(routes),
		},
		liveReload: input.dev?.liveReload || false,
		testScheduled: input.dev?.testScheduled,
		// absolute resolved path
		persist: localPersistencePath,
		registry: input.dev?.registry,
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
	printBindings({
		...bindings,
		vars: maskedVars,
	});

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
	const legacySite = unwrapHook(input.legacy?.site, config);

	const legacyAssets = unwrapHook(input.legacy?.assets, config);

	const entry = await getEntry(
		{
			assets: Boolean(legacyAssets),
			script: input.entrypoint,
			moduleRoot: input.build?.moduleRoot,
		},
		config,
		"dev"
	);

	const nodejsCompatMode = unwrapHook(input.build?.nodejsCompatMode, config);

	const { bindings, unsafe } = await resolveBindings(config, input);

	const resolved = {
		name: getScriptName({ name: input.name, env: input.env }, config),
		compatibilityDate: getDevCompatibilityDate(config, input.compatibilityDate),
		compatibilityFlags: input.compatibilityFlags ?? config.compatibility_flags,
		entrypoint: entry.file,
		directory: entry.directory,
		bindings,
		sendMetrics: input.sendMetrics ?? config.send_metrics,
		triggers: await resolveTriggers(config, input),
		env: input.env,
		build: {
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
		},
		dev: await resolveDevConfig(config, input),
		legacy: {
			site: legacySite,
			assets: legacyAssets,
			enableServiceEnvironments:
				input.legacy?.enableServiceEnvironments ?? !isLegacyEnv(config),
		},
		unsafe: {
			capnp: input.unsafe?.capnp ?? unsafe?.capnp,
			metadata: input.unsafe?.metadata ?? unsafe?.metadata,
		},
	} satisfies StartDevWorkerOptions;

	if (resolved.legacy.assets && resolved.legacy.site) {
		throw new UserError(
			"Cannot use Assets and Workers Sites in the same Worker."
		);
	}

	const services = extractBindingsOfType("service", resolved.bindings);
	if (services && services.length > 0) {
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
		logger.warn(
			"Queues are currently in Beta and are not supported in wrangler dev remote mode."
		);
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
	public set(input: StartDevWorkerInput) {
		return this.#updateConfig(input);
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

	async #updateConfig(input: StartDevWorkerInput) {
		this.#abortController?.abort();
		this.#abortController = new AbortController();
		const signal = this.#abortController.signal;
		this.latestInput = input;

		const fileConfig = readConfig(input.config, {
			env: input.env,
			"dispatch-namespace": undefined,
			"legacy-env": !input.legacy?.enableServiceEnvironments ?? true,
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
		});
		void this.#ensureWatchingConfig(fileConfig.configPath);

		const resolvedConfig = await resolveConfig(fileConfig, input);
		if (signal.aborted) {
			return;
		}
		this.latestConfig = resolvedConfig;
		this.emitConfigUpdateEvent(resolvedConfig);
		return this.latestConfig;
	}

	// ******************
	//   Event Handlers
	// ******************

	async teardown() {
		await this.#configWatcher?.close();
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(config: StartDevWorkerOptions) {
		this.emit("configUpdate", { type: "configUpdate", config });
	}
}
