import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import {
	extractBindingsOfType,
	isUnsafeBindingType,
} from "@cloudflare/deploy-helpers";
import {
	getBindingLocalSupport,
	getBrowserRenderingHeadfulFromEnv,
	getLocalExplorerEnabledFromEnv,
	getLocalObservabilityEnabledFromEnv,
	getTodaysCompatDate,
	getWranglerHiddenDirPath,
	UserError,
} from "@cloudflare/workers-utils";
import { Log, LogLevel } from "miniflare";
import { logger } from "../../logger";
import { getMetricsConfig } from "../../metrics";
import { getSourceMappedString } from "../../sourcemap";
import { updateCheck } from "../../update-check";
import { warnOrError } from "../../utils/print-bindings";
import { getDurableObjectClassNameToUseSQLiteMap } from "../class-names-sqlite";
import type { StartDevWorkerInput } from "../../api/startDevWorker/types";
import type { LoggerLevel } from "../../logger";
import type { EsbuildBundle } from "../use-esbuild";
import type {
	AssetsOptions,
	Binding,
	CfModuleType,
	CfScriptFormat,
	Config,
	ContainerEngine,
	LegacyAssetPaths,
	ServiceFetch,
} from "@cloudflare/workers-utils";
import type {
	DOContainerOptions,
	Json,
	LegacyConfig,
	MiniflareBinding,
	MiniflareExport,
	MiniflareOptions,
	MiniflareTrigger,
	MiniflareWorkerConfig,
	RemoteProxyConnectionString,
	WorkerdStructuredLog,
	WorkerOptions,
	WorkerRegistry,
} from "miniflare";
import type { UUID } from "node:crypto";

// This worker proxies all external Durable Objects to the Wrangler session
// where they're defined, and receives all requests from other Wrangler sessions
// for this session's Durable Objects. Note the original request URL may contain
// non-standard protocols, so we store it in a header to restore later.
// It also provides stub classes for services that couldn't be found, for
// improved error messages when trying to call RPC methods.
const EXTERNAL_SERVICE_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";

type SpecificPort = Exclude<number, 0>;
type RandomConsistentPort = 0; // random port, but consistent across reloads
type RandomDifferentPort = undefined; // random port, but different across reloads
type Port = SpecificPort | RandomConsistentPort | RandomDifferentPort;

export interface ConfigBundle {
	// TODO(soon): maybe rename some of these options, check proposed API Google Docs
	name: string | undefined;
	projectRoot: string;
	bundle: EsbuildBundle;
	format: CfScriptFormat | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	complianceRegion: Config["compliance_region"] | undefined;
	bindings: StartDevWorkerInput["bindings"];
	migrations: Config["migrations"] | undefined;
	exports: Config["exports"] | undefined;
	devRegistry: string | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
	inspectorHost: string | undefined;
	localPersistencePath: string | false;
	crons: Config["triggers"]["crons"];
	routes: string[] | undefined;
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	localUpstream: string | undefined;
	upstreamProtocol: "http" | "https";
	inspect: boolean;
	outboundService: ServiceFetch | undefined;
	tails: Config["tail_consumers"] | undefined;
	streamingTails: Config["streaming_tail_consumers"] | undefined;
	testScheduled: boolean;
	containerDOClassNames: Set<string> | undefined;
	containerBuildId: string | undefined;
	containerEngine: ContainerEngine | undefined;
	enableContainers: boolean;
	// Zone to use for the CF-Worker header in outbound fetches
	zone: string | undefined;
	sendMetrics: boolean | undefined;
	// The stable, externally-reachable URL of the proxy server in front of
	// this Miniflare instance (e.g. Wrangler's ProxyWorker URL).
	publicUrl: string | undefined;
	structuredLogsHandler: ((log: WorkerdStructuredLog) => void) | undefined;
}

export class WranglerLog extends Log {
	#warnedCompatibilityDateFallback = false;

	log(message: string) {
		// Hide request logs for external Durable Objects proxy worker
		if (message.includes(EXTERNAL_SERVICE_WORKER_NAME)) {
			return;
		}
		super.log(message);
	}

	warn(message: string) {
		// Only log warning about requesting a compatibility date after the workerd
		// binary's version once, and only if there's an update available.
		if (message.startsWith("The latest compatibility date supported by")) {
			if (this.#warnedCompatibilityDateFallback) {
				return;
			}
			this.#warnedCompatibilityDateFallback = true;
			return void updateCheck().then((result) => {
				if (result.status !== "update-available") {
					return;
				}
				message += [
					"",
					"Features enabled by your requested compatibility date may not be available.",
					`Upgrade to \`wrangler@${result.latest}\` to remove this warning.`,
				].join("\n");
				super.warn(message);
			});
		}
		super.warn(message);
	}
}

const DEFAULT_WORKER_NAME = "worker";
function getName(config: Pick<ConfigBundle, "name">) {
	return config.name ?? DEFAULT_WORKER_NAME;
}
const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
export function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
}

export function castLogLevel(level: LoggerLevel): LogLevel {
	let key = level.toUpperCase() as Uppercase<LoggerLevel>;
	if (key === "LOG") {
		key = "INFO";
	}

	return LogLevel[key];
}

export function buildLog(): Log {
	const level = castLogLevel(logger.loggerLevel);

	return new WranglerLog(level, {
		prefix: level === LogLevel.DEBUG ? "wrangler-UserWorker" : "wrangler",
	});
}

export type ManifestModuleType = NonNullable<
	MiniflareWorkerConfig["manifest"]
>["modules"][string]["type"];

/**
 * Maps Wrangler's internal {@link CfModuleType} to the config-schema
 * `ModuleType` used by Miniflare's manifest.
 */
export function toManifestModuleType(
	cfType: CfModuleType | undefined
): ManifestModuleType {
	switch (cfType) {
		case "commonjs":
			return "cjs";
		case "compiled-wasm":
			return "wasm";
		case "buffer":
			return "data";
		case undefined:
		case "esm":
			return "esm";
		default:
			return cfType;
	}
}

type SourceResult =
	| { manifest: MiniflareWorkerConfig["manifest"] }
	| { serviceWorkerScript: string };

async function buildSourceOptions(
	config: Omit<ConfigBundle, "rules">
): Promise<{ source: SourceResult; entrypointNames: string[] }> {
	const scriptPath = config.bundle.path;
	if (config.format === "modules") {
		const isPython = config.bundle.type === "python";

		const entrypointSource = config.bundle.entrypointSource;
		const extraModules = config.bundle.modules;

		const entrypointNames = isPython ? [] : config.bundle.entry.exports;

		// Extra module names are already relative to the bundle's module root
		// (see `findAdditionalModules`), so key the whole manifest against that
		// same root. Names become workerd module specifiers, which must be
		// relative (workerd rejects absolute module names). Miniflare
		// reconstructs each module's absolute `//# sourceURL` from `rootPath` +
		// name, so we no longer apply `withSourceURLs` here.
		const modulesRoot = config.bundle.entry.moduleRoot;
		const mainModule = path.relative(modulesRoot, scriptPath);
		const modules: NonNullable<MiniflareWorkerConfig["manifest"]>["modules"] = {
			[mainModule]: {
				type: toManifestModuleType(config.bundle.type),
				contents: entrypointSource,
			},
		};
		for (const module of extraModules) {
			modules[module.name] = {
				type: toManifestModuleType(module.type),
				contents: module.content,
			};
		}

		return {
			source: { manifest: { mainModule, modules, rootPath: modulesRoot } },
			entrypointNames,
		};
	} else {
		// Service-worker scripts have no manifest, so Miniflare can't derive a
		// real on-disk `//# sourceURL` (it falls back to an internal
		// `script-<n>` id). Add the comment here so stack traces and the
		// inspector point at the real file; Miniflare leaves an existing
		// comment untouched.
		const serviceWorkerScript = `${config.bundle.entrypointSource}\n//# sourceURL=${pathToFileURL(scriptPath)}\n`;
		return {
			source: { serviceWorkerScript },
			entrypointNames: [],
		};
	}
}

function getRemoteId(id: string | symbol | undefined): string | null {
	return typeof id === "string" ? id : null;
}

/** A record of `config.env` bindings, keyed by binding name. */
type EnvBindings = Record<string, MiniflareBinding>;
/** The handler shape for `fetcher`/`outboundService` custom services. */
type FetcherHandler = Extract<MiniflareBinding, { type: "fetcher" }>["handler"];
/** A record of `config.exports`, keyed by export (class) name. */
type Exports = Record<string, MiniflareExport>;

/** Blob bindings that live under `legacy` in the new schema. */
type LegacyBlobBindings = Pick<
	LegacyConfig,
	"wasmBindings" | "textBlobBindings" | "dataBlobBindings"
>;

/** The `queue` trigger entries derived from queue consumers. */
type QueueTrigger = Extract<MiniflareTrigger, { type: "queue" }>;

type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];
function queueConsumerTrigger(consumer: QueueConsumer): QueueTrigger {
	return {
		type: "queue",
		name: consumer.queue,
		maxBatchSize: consumer.max_batch_size,
		maxBatchTimeout: consumer.max_batch_timeout,
		maxRetries: consumer.max_retries,
		deadLetterQueue: consumer.dead_letter_queue,
		retryDelay: consumer.retry_delay,
	};
}

/** The reshaped bindings output for a single worker. */
export interface WorkerBindingOptions {
	/** `config.env` — all bindings keyed by binding name. */
	env: EnvBindings;
	/** `config.exports` — internal DO/workflow class definitions. */
	exports: Exports;
	/** Blob bindings that belong under `legacy`. */
	legacyBindings: LegacyBlobBindings;
}

type MiniflareBindingsConfig = Pick<
	ConfigBundle,
	| "bindings"
	| "migrations"
	| "exports"
	| "name"
	| "containerDOClassNames"
	| "containerBuildId"
	| "enableContainers"
> &
	Partial<Pick<ConfigBundle, "format" | "bundle">>;

/**
 * Records whether a binding should be proxied to a remote resource. In the new
 * schema this is a plain boolean on the binding; the actual connection string
 * is set once, at the worker level (`dev.remoteProxyConnectionString`), and the
 * miniflare plugins combine the two via `getRemoteProxyConnectionString`.
 *
 * Binding types with no local simulator (`DO-NOT-USE-...`) are always proxied
 * remotely regardless of the `remote` flag, mirroring `pickRemoteBindings` in
 * `@cloudflare/remote-bindings` (which collects the bindings to proxy).
 */
function isRemote(
	type: Binding["type"],
	remote: boolean | undefined,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): boolean {
	if (remoteProxyConnectionString === undefined) {
		return false;
	}
	if (
		getBindingLocalSupport(type) ===
		"DO-NOT-USE-this-resource-will-never-have-a-local-simulator"
	) {
		return true;
	}
	return Boolean(remote);
}

export function buildMiniflareBindingOptions(
	config: MiniflareBindingsConfig,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): {
	bindingOptions: WorkerBindingOptions;
	externalWorkers: WorkerOptions[];
} {
	const bindings = config.bindings;

	const textBlobs = extractBindingsOfType("text_blob", bindings);
	const dataBlobs = extractBindingsOfType("data_blob", bindings);
	const wasmModules = extractBindingsOfType("wasm_module", bindings);
	const plainTextBindings = extractBindingsOfType("plain_text", bindings);
	const secretTextBindings = extractBindingsOfType("secret_text", bindings);
	const jsonBindings = extractBindingsOfType("json", bindings);
	const kvNamespaces = extractBindingsOfType("kv_namespace", bindings);
	const r2Buckets = extractBindingsOfType("r2_bucket", bindings);
	const d1Databases = extractBindingsOfType("d1", bindings);
	const queues = extractBindingsOfType("queue", bindings);
	const pipelines = extractBindingsOfType("pipeline", bindings);
	const hyperdrives = extractBindingsOfType("hyperdrive", bindings);
	const workflows = extractBindingsOfType("workflow", bindings);
	const durableObjects = extractBindingsOfType(
		"durable_object_namespace",
		bindings
	);
	const services = extractBindingsOfType("service", bindings);
	const analyticsEngineDatasets = extractBindingsOfType(
		"analytics_engine",
		bindings
	);
	const dispatchNamespaces = extractBindingsOfType(
		"dispatch_namespace",
		bindings
	);
	const mtlsCertificates = extractBindingsOfType("mtls_certificate", bindings);
	const vectorizeBindings = extractBindingsOfType("vectorize", bindings);
	const vpcServices = extractBindingsOfType("vpc_service", bindings);
	const vpcNetworks = extractBindingsOfType("vpc_network", bindings);
	const secretsStoreSecrets = extractBindingsOfType(
		"secrets_store_secret",
		bindings
	);
	const helloWorldBindings = extractBindingsOfType(
		"unsafe_hello_world",
		bindings
	);
	const flagshipBindings = extractBindingsOfType("flagship", bindings);
	const artifactsBindings = extractBindingsOfType("artifacts", bindings);
	const workerLoaders = extractBindingsOfType("worker_loader", bindings);
	const sendEmailBindings = extractBindingsOfType("send_email", bindings);
	// Extract both regular and unsafe ratelimit bindings
	// Unsafe bindings have type "unsafe_ratelimit" (prefixed with "unsafe_")
	const ratelimits = [
		...extractBindingsOfType("ratelimit", bindings),
		...extractBindingsOfType("unsafe_ratelimit", bindings),
	];
	const aiBindings = extractBindingsOfType("ai", bindings);
	const aiSearchNamespaceBindings = extractBindingsOfType(
		"ai_search_namespace",
		bindings
	);
	const aiSearchInstanceBindings = extractBindingsOfType("ai_search", bindings);
	const websearchBindings = extractBindingsOfType("websearch", bindings);
	const agentMemoryBindings = extractBindingsOfType("agent_memory", bindings);
	const imagesBindings = extractBindingsOfType("images", bindings);
	const mediaBindings = extractBindingsOfType("media", bindings);
	const browserBindings = extractBindingsOfType("browser", bindings);
	const versionMetadataBindings = extractBindingsOfType(
		"version_metadata",
		bindings
	);
	const streamBindings = extractBindingsOfType("stream", bindings);
	const fetchers = extractBindingsOfType("fetcher", bindings);

	const workerName = getName(config);

	// `config.env` — every binding, keyed by binding name, discriminated by `type`.
	const env: EnvBindings = {};
	// `config.exports` — internal DO/workflow class definitions, keyed by class name.
	const exports: Exports = {};

	const container = (className: string) =>
		config.containerDOClassNames?.size && config.enableContainers
			? getImageNameFromDOClassName({
					doClassName: className,
					containerDOClassNames: config.containerDOClassNames,
					containerBuildId: config.containerBuildId,
				})
			: undefined;

	// Blob bindings live under `legacy` in the new schema. For service-worker
	// format, blobs are accessible on the global scope.
	const textBlobBindings: Record<string, string> = {};
	for (const blob of textBlobs) {
		if ("path" in blob.source && blob.source.path) {
			textBlobBindings[blob.binding] = blob.source.path;
		} else if ("contents" in blob.source) {
			textBlobBindings[blob.binding] = blob.source.contents;
		}
	}

	const dataBlobBindings: Record<string, string | Uint8Array<ArrayBuffer>> = {};
	for (const blob of dataBlobs) {
		if ("path" in blob.source && blob.source.path) {
			dataBlobBindings[blob.binding] = blob.source.path;
		} else if ("contents" in blob.source) {
			dataBlobBindings[blob.binding] = blob.source
				.contents as Uint8Array<ArrayBuffer>;
		}
	}

	const wasmBindings: Record<string, string | Uint8Array<ArrayBuffer>> = {};
	for (const wasm of wasmModules) {
		if ("path" in wasm.source && wasm.source.path) {
			wasmBindings[wasm.binding] = wasm.source.path;
		} else if ("contents" in wasm.source) {
			wasmBindings[wasm.binding] = wasm.source
				.contents as Uint8Array<ArrayBuffer>;
		}
	}

	if (config.format === "service-worker" && config.bundle) {
		const scriptPath = config.bundle.path;
		const modulesRoot = path.dirname(scriptPath);
		for (const { type, name } of config.bundle.modules) {
			if (type === "text") {
				textBlobBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			} else if (type === "buffer") {
				dataBlobBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			} else if (type === "compiled-wasm") {
				wasmBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			}
		}
	}

	const legacyBindings: LegacyBlobBindings = {
		wasmBindings,
		textBlobBindings,
		dataBlobBindings,
	};

	// Vars: plain_text/secret_text → `text`, json → `json`.
	for (const binding of plainTextBindings) {
		env[binding.binding] = { type: "text", value: binding.value };
	}
	for (const binding of secretTextBindings) {
		env[binding.binding] = { type: "text", value: String(binding.value) };
	}
	for (const binding of jsonBindings) {
		env[binding.binding] = { type: "json", value: binding.value as Json };
	}

	for (const binding of versionMetadataBindings) {
		env[binding.binding] = { type: "version-metadata" };
	}

	// Function-backed service bindings (`fetcher`).
	for (const fetcher of fetchers) {
		env[fetcher.binding] = {
			type: "fetcher",
			handler: fetcher.fetcher as unknown as FetcherHandler,
		};
	}

	// Service bindings to other workers.
	for (const service of services) {
		// A `dev` plugin routes the binding through Miniflare's external-plugin
		// pathway instead of a regular service binding.
		if (service.dev !== undefined) {
			const {
				binding,
				dev: { plugin, options: devOptions },
				remote: _remote,
				props: _props,
				type: _type,
				...options
			} = service;

			logger.debug(
				`Binding ${binding} is a local binding to plugin ${plugin.name} provided by package ${plugin.package}`
			);

			env[binding] = {
				type: "unsafe:service",
				dev: { plugin, options: { ...options, ...devOptions } },
			};
			continue;
		}

		env[service.binding] = {
			type: "worker",
			workerName: service.service,
			exportName: service.entrypoint,
			props: service.props,
			remote: isRemote("service", service.remote, remoteProxyConnectionString),
		};
	}

	// Other unsafe bindings with local dev config (e.g. unsafe ratelimit is
	// handled separately below; this covers freeform unsafe service bindings).
	const unsafeBindingsWithLocalDev = Object.entries(bindings ?? {}).filter(
		(b) => isUnsafeServiceBindingWithDevCfg(b[1])
	);
	for (const [name, unsafeBinding] of unsafeBindingsWithLocalDev) {
		assert(isUnsafeServiceBindingWithDevCfg(unsafeBinding));
		const {
			type,
			dev: {
				plugin,
				options: /* additional options just for dev */ devOptions,
			},
			// additional options that are included in the production binding
			...options
		} = unsafeBinding;

		logger.debug(
			`Binding ${name} is a local binding to plugin ${plugin.name} provided by package ${plugin.package}`
		);

		env[name] = {
			type: `unsafe:${type.slice("unsafe_".length)}`,
			dev: { plugin, options: { ...options, ...devOptions } },
		};
	}

	// KV / R2 / D1.
	for (const kv of kvNamespaces) {
		env[kv.binding] = {
			type: "kv",
			id: getRemoteId(kv.id) ?? kv.binding,
			remote: isRemote("kv_namespace", kv.remote, remoteProxyConnectionString),
		};
	}
	for (const r2 of r2Buckets) {
		env[r2.binding] = {
			type: "r2",
			name: getRemoteId(r2.bucket_name) ?? r2.binding,
			s3Credentials: r2.local_dev?.experimental_s3_credentials,
			remote: isRemote("r2_bucket", r2.remote, remoteProxyConnectionString),
		};
	}
	for (const d1 of d1Databases) {
		env[d1.binding] = {
			type: "d1",
			id: getRemoteId(d1.preview_database_id ?? d1.database_id) ?? d1.binding,
			remote: isRemote("d1", d1.remote, remoteProxyConnectionString),
		};
	}

	// Queue producers (consumers are triggers, handled at assembly time).
	for (const queue of queues) {
		env[queue.binding] = {
			type: "queue",
			name: getRemoteId(queue.queue_name) ?? queue.binding,
			deliveryDelay: queue.delivery_delay,
			remote: isRemote("queue", queue.remote, remoteProxyConnectionString),
		};
	}

	// Pipelines.
	for (const pipeline of pipelines) {
		const name = pipeline.stream ?? pipeline.pipeline;
		if (name === undefined) {
			throw new UserError(`Pipeline "${pipeline.binding}" must have a stream`, {
				telemetryMessage: "pipeline binding missing stream",
			});
		}
		env[pipeline.binding] = {
			type: "pipeline",
			name,
			remote: isRemote("pipeline", pipeline.remote, remoteProxyConnectionString),
		};
	}

	// Hyperdrive.
	for (const hyperdrive of hyperdrives) {
		env[hyperdrive.binding] = {
			type: "hyperdrive",
			id: hyperdrive.id,
			localConnectionString: hyperdrive.localConnectionString,
		};
	}

	// Analytics Engine.
	for (const dataset of analyticsEngineDatasets) {
		env[dataset.binding] = {
			type: "analytics-engine-dataset",
			name: dataset.dataset ?? "dataset",
		};
	}

	// Workflows: binding in `env`, plus (for internal workflows) an `exports`
	// entry carrying step limits.
	for (const workflow of workflows) {
		const external =
			workflow.script_name !== undefined && workflow.script_name !== workerName;
		if (external) {
			if (workflow.limits) {
				throw new UserError(
					`Workflow "${workflow.name}" has "limits" configured but references external script "${workflow.script_name}". ` +
						`Configure limits on the worker that defines the workflow.`,
					{ telemetryMessage: "workflow limits on external script" }
				);
			}
			if (workflow.schedules) {
				throw new UserError(
					`Workflow "${workflow.name}" has "schedules" configured but references external script "${workflow.script_name}". ` +
						`Configure schedules on the worker that defines the workflow.`,
					{ telemetryMessage: "workflow schedules on external script" }
				);
			}
		}
		env[workflow.binding] = {
			type: "workflow",
			name: workflow.name,
			workerName: workflow.script_name ?? workerName,
			exportName: workflow.class_name,
			remote: isRemote("workflow", workflow.remote, remoteProxyConnectionString),
		};
		if (!external) {
			exports[workflow.class_name] = {
				type: "workflow",
				name: workflow.name,
				...(workflow.limits?.steps !== undefined && {
					limits: { steps: workflow.limits.steps },
				}),
			};
		}
	}

	// Secrets store secrets.
	for (const secret of secretsStoreSecrets) {
		env[secret.binding] = {
			type: "secrets-store-secret",
			storeId: secret.store_id,
			secretName: secret.secret_name,
		};
	}

	// Internal `hello-world` example bindings.
	for (const helloWorld of helloWorldBindings) {
		env[helloWorld.binding] = {
			type: "hello-world",
			enable_timer: helloWorld.enable_timer,
		};
	}

	// Flagship.
	for (const flagship of flagshipBindings) {
		warnOrError("flagship", flagship.remote);
		env[flagship.binding] = {
			type: "flagship",
			id: getRemoteId(flagship.app_id) ?? flagship.binding,
			remote: isRemote("flagship", flagship.remote, remoteProxyConnectionString),
		};
	}

	// Artifacts.
	for (const artifact of artifactsBindings) {
		warnOrError("artifacts", artifact.remote);
		env[artifact.binding] = {
			type: "artifacts",
			namespace: artifact.namespace,
			remote: isRemote("artifacts", artifact.remote, remoteProxyConnectionString),
		};
	}

	// Worker loaders.
	for (const workerLoader of workerLoaders) {
		env[workerLoader.binding] = { type: "worker-loader" };
	}

	// AI + AI search + web search + agent memory.
	for (const ai of aiBindings) {
		warnOrError("ai", ai.remote);
		env[ai.binding] = {
			type: "ai",
			remote: isRemote("ai", ai.remote, remoteProxyConnectionString),
		};
	}
	for (const ns of aiSearchNamespaceBindings) {
		warnOrError("ai_search_namespace", ns.remote);
		env[ns.binding] = {
			type: "ai-search-namespace",
			namespace: ns.namespace as string,
			remote: isRemote(
				"ai_search_namespace",
				ns.remote,
				remoteProxyConnectionString
			),
		};
	}
	for (const inst of aiSearchInstanceBindings) {
		warnOrError("ai_search", inst.remote);
		env[inst.binding] = {
			type: "ai-search",
			name: inst.instance_name,
			remote: isRemote("ai_search", inst.remote, remoteProxyConnectionString),
		};
	}
	for (const ws of websearchBindings) {
		warnOrError("websearch", ws.remote);
		env[ws.binding] = {
			type: "web-search",
			remote: isRemote("websearch", ws.remote, remoteProxyConnectionString),
		};
	}
	for (const memory of agentMemoryBindings) {
		warnOrError("agent_memory", memory.remote);
		env[memory.binding] = {
			type: "agent-memory",
			namespace: memory.namespace as string,
			remote: isRemote(
				"agent_memory",
				memory.remote,
				remoteProxyConnectionString
			),
		};
	}

	// Email.
	for (const sendEmail of sendEmailBindings) {
		// `CfSendEmailBindings` is a union over its optional fields, so read them
		// off a widened view rather than the narrowed union.
		const email = sendEmail as {
			destination_address?: string;
			allowed_destination_addresses?: string[];
			allowed_sender_addresses?: string[];
		};
		env[sendEmail.name] = {
			type: "send-email",
			destinationAddress: email.destination_address,
			allowedDestinationAddresses: email.allowed_destination_addresses,
			allowedSenderAddresses: email.allowed_sender_addresses,
			remote: isRemote(
				"send_email",
				sendEmail.remote,
				remoteProxyConnectionString
			),
		};
	}

	// Images / media / browser / stream (all singletons).
	for (const image of imagesBindings) {
		env[image.binding] = {
			type: "images",
			remote: isRemote("images", image.remote, remoteProxyConnectionString),
		};
	}
	for (const media of mediaBindings) {
		warnOrError("media", media.remote);
		env[media.binding] = {
			type: "media",
			remote: isRemote("media", media.remote, remoteProxyConnectionString),
		};
	}
	for (const browser of browserBindings) {
		env[browser.binding] = {
			type: "browser",
			remote: isRemote("browser", browser.remote, remoteProxyConnectionString),
		};
	}
	for (const stream of streamBindings) {
		env[stream.binding] = {
			type: "stream",
			remote: isRemote("stream", stream.remote, remoteProxyConnectionString),
		};
	}

	// Vectorize.
	for (const vectorize of vectorizeBindings) {
		warnOrError("vectorize", vectorize.remote);
		env[vectorize.binding] = {
			type: "vectorize",
			name: vectorize.index_name,
			remote: isRemote(
				"vectorize",
				vectorize.remote,
				remoteProxyConnectionString
			),
		};
	}

	// VPC services + networks.
	for (const vpc of vpcServices) {
		warnOrError("vpc_service", vpc.remote);
		env[vpc.binding] = {
			type: "vpc-service",
			id: vpc.service_id,
			remote: isRemote("vpc_service", vpc.remote, remoteProxyConnectionString),
		};
	}
	for (const vpc of vpcNetworks) {
		warnOrError("vpc_network", vpc.remote);
		env[vpc.binding] = {
			type: "vpc-network",
			...(vpc.tunnel_id !== undefined
				? { tunnelId: vpc.tunnel_id }
				: { networkId: vpc.network_id as string }),
			remote: isRemote("vpc_network", vpc.remote, remoteProxyConnectionString),
		};
	}

	// Dispatch namespaces.
	for (const dispatchNamespace of dispatchNamespaces) {
		warnOrError("dispatch_namespace", dispatchNamespace.remote);
		env[dispatchNamespace.binding] = {
			type: "dispatch-namespace",
			namespace: getRemoteId(dispatchNamespace.namespace) ?? undefined,
			remote: isRemote(
				"dispatch_namespace",
				dispatchNamespace.remote,
				remoteProxyConnectionString
			),
		};
	}

	// mTLS certificates.
	for (const mtlsCertificate of mtlsCertificates) {
		warnOrError("mtls_certificate", mtlsCertificate.remote);
		env[mtlsCertificate.binding] = {
			type: "mtls-certificate",
			id: mtlsCertificate.certificate_id,
			remote: isRemote(
				"mtls_certificate",
				mtlsCertificate.remote,
				remoteProxyConnectionString
			),
		};
	}

	// Rate limits (regular + unsafe).
	for (const ratelimit of ratelimits) {
		env[ratelimit.name] = {
			type: "rate-limit",
			namespace: String(ratelimit.namespace_id ?? ratelimit.name),
			simple: {
				limit: ratelimit.simple.limit,
				period: ratelimit.simple.period as 10 | 60,
			},
		};
	}

	// Durable Objects: every DO gets an `env` binding; internal DOs
	// (defined in this worker) additionally get an `exports` class definition.
	const classNameToUseSQLite = getDurableObjectClassNameToUseSQLiteMap(
		config.migrations,
		config.exports
	);

	const doStorage = (className: string): "sqlite" | "legacy-kv" =>
		classNameToUseSQLite.get(className) ? "sqlite" : "legacy-kv";

	for (const {
		name,
		class_name: className,
		script_name: scriptName,
	} of durableObjects) {
		const external = scriptName !== undefined && scriptName !== workerName;
		env[name] = {
			type: "durable-object",
			workerName: scriptName ?? workerName,
			exportName: className,
		};
		if (!external) {
			exports[className] = {
				type: "durable-object",
				state: "created",
				storage: doStorage(className),
				container: container(className),
			};
		}
	}

	// DOs configured via migrations but not bound are internal and only need an
	// `exports` class definition (they're reachable via `ctx.exports`).
	for (const [className] of classNameToUseSQLite) {
		if (exports[className] === undefined) {
			exports[className] = {
				type: "durable-object",
				state: "created",
				storage: doStorage(className),
				container: container(className),
			};
		}
	}

	const externalWorkers: WorkerOptions[] = [];

	return {
		bindingOptions: { env, exports, legacyBindings },
		externalWorkers,
	};
}

export function getDefaultProjectTmpPath(projectRoot: string): string {
	return path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
}

export function getDefaultPersistRoot(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): string | undefined {
	if (localPersistencePath !== false) {
		const v3Path = path.join(localPersistencePath, "v3");
		return v3Path;
	}
}

/**
 * Builds the `config.assets` block and (if bound) the `assets` env binding from
 * Wrangler's resolved {@link AssetsOptions}.
 */
export function buildAssetOptions(config: Pick<ConfigBundle, "assets">): {
	assets?: MiniflareWorkerConfig["assets"];
	assetsBinding?: [name: string, binding: MiniflareBinding];
} {
	if (!config.assets) {
		return {};
	}
	const { routerConfig, assetConfig } = config.assets;
	const assets: MiniflareWorkerConfig["assets"] = {
		directory: config.assets.directory,
		hasUserWorker: routerConfig.has_user_worker ?? false,
		htmlHandling: assetConfig.html_handling,
		notFoundHandling: assetConfig.not_found_handling,
		runWorkerFirst: config.assets.run_worker_first,
	};
	return {
		assets,
		assetsBinding: config.assets.binding
			? [config.assets.binding, { type: "assets" }]
			: undefined,
	};
}

/** Builds the `legacy` Workers Sites options. */
export function buildSitesOptions({
	legacyAssetPaths,
}: Pick<ConfigBundle, "legacyAssetPaths">): Pick<
	LegacyConfig,
	"sitePath" | "siteInclude" | "siteExclude"
> {
	if (legacyAssetPaths !== undefined) {
		const { baseDirectory, assetDirectory, includePatterns, excludePatterns } =
			legacyAssetPaths;
		return {
			sitePath: path.join(baseDirectory, assetDirectory),
			siteInclude: includePatterns.length > 0 ? includePatterns : undefined,
			siteExclude: excludePatterns.length > 0 ? excludePatterns : undefined,
		};
	}
	return {};
}

/**
 * Builds the `config.triggers` array (routes → `fetch`, crons → `scheduled`,
 * queue consumers → `queue`) and `config.tailConsumers` for a worker.
 */
export function buildTriggersAndTailConsumers(
	config: Partial<
		Pick<
			ConfigBundle,
			"routes" | "crons" | "queueConsumers" | "tails" | "streamingTails"
		>
	>
): {
	triggers: MiniflareTrigger[];
	tailConsumers: NonNullable<MiniflareWorkerConfig["tailConsumers"]>;
} {
	const triggers: MiniflareTrigger[] = [];
	for (const pattern of config.routes ?? []) {
		triggers.push({ type: "fetch", pattern });
	}
	for (const schedule of config.crons ?? []) {
		triggers.push({ type: "scheduled", schedule });
	}
	for (const consumer of config.queueConsumers ?? []) {
		triggers.push(queueConsumerTrigger(consumer));
	}

	const tailConsumers: NonNullable<MiniflareWorkerConfig["tailConsumers"]> = [];
	for (const tail of config.tails ?? []) {
		tailConsumers.push({ workerName: tail.service });
	}
	for (const streamingTail of config.streamingTails ?? []) {
		tailConsumers.push({ workerName: streamingTail.service, streaming: true });
	}

	return { triggers, tailConsumers };
}

export type Options = Extract<MiniflareOptions, { workers: WorkerOptions[] }>;

export async function buildMiniflareOptions(
	log: Log,
	config: Omit<ConfigBundle, "rules">,
	proxyToUserWorkerAuthenticationSecret: UUID,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	onDevRegistryUpdate?: (registry: WorkerRegistry) => void
): Promise<Options> {
	const upstream =
		typeof config.localUpstream === "string"
			? `${config.upstreamProtocol}://${config.localUpstream}`
			: undefined;

	const { source } = await buildSourceOptions(config);
	const {
		bindingOptions: { env, exports, legacyBindings },
		externalWorkers,
	} = buildMiniflareBindingOptions(config, remoteProxyConnectionString);

	const browserBinding = Object.values(env).find((b) => b.type === "browser");
	if (browserBinding && getBrowserRenderingHeadfulFromEnv()) {
		browserBinding.headful = true;
	}

	const sitesOptions = buildSitesOptions(config);
	const resourcePersistencePath = getDefaultPersistRoot(
		config.localPersistencePath
	);
	const resourceTmpPath = getDefaultProjectTmpPath(config.projectRoot);
	const { assets, assetsBinding } = buildAssetOptions(config);
	if (assetsBinding) {
		env[assetsBinding[0]] = assetsBinding[1];
	}

	const { triggers, tailConsumers } = buildTriggersAndTailConsumers(config);

	const isServiceWorker = "serviceWorkerScript" in source;

	const workerConfig: MiniflareWorkerConfig = {
		type: "worker",
		name: getName(config),
		compatibilityDate: config.compatibilityDate ?? getTodaysCompatDate(),
		compatibilityFlags: config.compatibilityFlags,
		env,
		exports,
		assets,
		tailConsumers: tailConsumers.length > 0 ? tailConsumers : undefined,
		triggers: triggers.length > 0 ? triggers : undefined,
		...(isServiceWorker ? {} : { manifest: source.manifest }),
	};

	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		publicUrl: config.publicUrl,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		inspectorHost: config.inspect ? config.inspectorHost : undefined,
		upstream,
		unsafeDevRegistryPath: config.devRegistry,
		unsafeHandleDevRegistryUpdate: onDevRegistryUpdate,
		unsafeProxySharedSecret: proxyToUserWorkerAuthenticationSecret,
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The one switch for local observability: this env var tells Miniflare core
		// to attach the trace collector to each user worker.
		unsafeObservability: getLocalObservabilityEnabledFromEnv(),
		unsafeInspectDurableObjects: true,
		telemetry: getMetricsConfig({ sendMetrics: config.sendMetrics }),
		// The way we run Miniflare instances with wrangler dev is that there are two:
		//  - one holding the proxy worker,
		//  - and one holding the user worker.
		// The issue with that setup is that end users would see two sets of request logs from Miniflare!
		// Instead of hiding all logs from this Miniflare instance, we specifically hide the request logs,
		// allowing other logs to be shown to the user (such as details about emails being triggered)
		logRequests: false,
		log,
		verbose: logger.loggerLevel === "debug",
		handleStructuredLogs: config.structuredLogsHandler ?? handleStructuredLogs,
		resourcePersistencePath,
		resourceTmpPath,
		containerEngine: config.containerEngine,
		workers: [
			{
				config: workerConfig,
				legacy: {
					...(isServiceWorker
						? { serviceWorkerScript: source.serviceWorkerScript }
						: {}),
					...legacyBindings,
					...sitesOptions,
				},
				dev: {
					remoteProxyConnectionString,
					outboundService: config.outboundService
						? {
								type: "fetcher",
								handler: config.outboundService as unknown as FetcherHandler,
							}
						: undefined,
					zone: config.zone,
				},
			},
			...externalWorkers,
		],
	};
	return options;
}

/**
 * Returns the Container options for the DO class name.
 * @returns The configuration or `undefined` when the DO has no attached container
 */
export function getImageNameFromDOClassName(options: {
	doClassName: string;
	containerDOClassNames: Set<string>;
	containerBuildId: string | undefined;
}): DOContainerOptions | undefined {
	assert(
		options.containerBuildId,
		"Build ID should be set if containers are defined and enabled"
	);

	if (options.containerDOClassNames.has(options.doClassName)) {
		return {
			imageName: getDevContainerImageName(
				options.doClassName,
				options.containerBuildId
			),
		};
	}
}

/**
 * isUnsafeServiceBindingWithDevCfg is a typeguard that checks whether the user has specified unsafe
 * service bindings with a local development configuration in their Worker options
 */
export function isUnsafeServiceBindingWithDevCfg(
	b: Binding
): b is Required<
	Exclude<
		Extract<Binding, { type: `unsafe_${string}` }>,
		{ type: "unsafe_hello_world" }
	>
> {
	return isUnsafeBindingType(b.type) && "dev" in b;
}

/**
 * handler for workerd's structured logs to pass to miniflare
 *
 * @param structuredLog log to print
 */
export function handleStructuredLogs({ level, message }: WorkerdStructuredLog) {
	if (level === "warn") {
		return logger.warn(message);
	}

	if (level === "info") {
		return logger.info(message);
	}

	if (level === "debug") {
		// note that debug logs are logged at the info level, this is like so because before structured logs
		// were introduced developers were used to call `console.debug` and get their logs in the terminal
		// during local development and we don't want to break such workflow in a non-major release
		// (For more context see: https://github.com/cloudflare/workers-sdk/issues/10690)
		//
		// TODO: for the next major release we do want the debug logs to be logged at the debug level instead,
		//       we should also introduce some mechanism to allows users to get their worker debug logs without
		//       also getting all the wrangler debug logs
		return logger.info(message);
	}

	if (level === "error") {
		return logger.error(getSourceMappedString(message));
	}

	return logger.log(getSourceMappedString(message));
}
