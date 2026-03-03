import assert from "node:assert";
import path from "node:path";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import { getLocalExplorerEnabledFromEnv } from "@cloudflare/workers-utils";
import { Log, LogLevel } from "miniflare";
import {
	extractBindingsOfType,
	isUnsafeBindingType,
} from "../../api/startDevWorker/utils";
import { ModuleTypeToRuleType } from "../../deployment-bundle/module-collection";
import { withSourceURLs } from "../../deployment-bundle/source-url";
import { logger } from "../../logger";
import { getSourceMappedString } from "../../sourcemap";
import { updateCheck } from "../../update-check";
import { warnOrError } from "../../utils/print-bindings";
import { getDurableObjectClassNameToUseSQLiteMap } from "../class-names-sqlite";
import type { StartDevWorkerInput } from "../../api/startDevWorker/types";
import type { AssetsOptions } from "../../assets";
import type { LoggerLevel } from "../../logger";
import type { LegacyAssetPaths } from "../../sites";
import type { EsbuildBundle } from "../use-esbuild";
import type {
	Binding,
	CfD1Database,
	CfDispatchNamespace,
	CfHyperdrive,
	CfKvNamespace,
	CfPipeline,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfWorkflow,
	Config,
	ContainerEngine,
} from "@cloudflare/workers-utils";
import type {
	DOContainerOptions,
	Json,
	MiniflareOptions,
	RemoteProxyConnectionString,
	SourceOptions,
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
	bundle: EsbuildBundle;
	format: CfScriptFormat | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	complianceRegion: Config["compliance_region"] | undefined;
	bindings: StartDevWorkerInput["bindings"];
	migrations: Config["migrations"] | undefined;
	devRegistry: string | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
	inspectorHost: string | undefined;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	upstreamProtocol: "http" | "https";
	inspect: boolean;
	tails: Config["tail_consumers"] | undefined;
	streamingTails: Config["streaming_tail_consumers"] | undefined;
	testScheduled: boolean;
	containerDOClassNames: Set<string> | undefined;
	containerBuildId: string | undefined;
	containerEngine: ContainerEngine | undefined;
	enableContainers: boolean;
	// Zone to use for the CF-Worker header in outbound fetches
	zone: string | undefined;
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
			return void updateCheck().then((maybeNewVersion) => {
				if (maybeNewVersion === undefined) {
					return;
				}
				message += [
					"",
					"Features enabled by your requested compatibility date may not be available.",
					`Upgrade to \`wrangler@${maybeNewVersion}\` to remove this warning.`,
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

async function buildSourceOptions(
	config: Omit<ConfigBundle, "rules">
): Promise<{ sourceOptions: SourceOptions; entrypointNames: string[] }> {
	const scriptPath = config.bundle.path;
	if (config.format === "modules") {
		const isPython = config.bundle.type === "python";

		const { entrypointSource, modules } = isPython
			? {
					entrypointSource: config.bundle.entrypointSource,
					modules: config.bundle.modules,
				}
			: withSourceURLs(
					scriptPath,
					config.bundle.entrypointSource,
					config.bundle.modules
				);

		const entrypointNames = isPython ? [] : config.bundle.entry.exports;

		// Use entry.moduleRoot when the script is within it (e.g., no_bundle with base_dir),
		// otherwise fall back to the script's directory (e.g., bundled output in temp dir)
		const entryModuleRoot = config.bundle.entry.moduleRoot;
		const modulesRoot =
			scriptPath.startsWith(entryModuleRoot + path.sep) ||
			scriptPath.startsWith(entryModuleRoot + "/")
				? entryModuleRoot
				: path.dirname(scriptPath);
		const sourceOptions: SourceOptions = {
			modulesRoot,

			modules: [
				// Entrypoint
				{
					type: ModuleTypeToRuleType[config.bundle.type],
					path: scriptPath,
					contents: entrypointSource,
				},
				// Misc (WebAssembly, etc, ...)
				...modules.map((module) => ({
					type: ModuleTypeToRuleType[module.type ?? "esm"],
					path: path.resolve(modulesRoot, module.name),
					contents: module.content,
				})),
			],
		};
		return { sourceOptions, entrypointNames };
	} else {
		// Miniflare will handle adding `//# sourceURL` comments if they're missing
		return {
			sourceOptions: { script: config.bundle.entrypointSource, scriptPath },
			entrypointNames: [],
		};
	}
}

function getRemoteId(id: string | symbol | undefined): string | null {
	return typeof id === "string" ? id : null;
}

function kvNamespaceEntry(
	{ binding, id: originalId, remote }: CfKvNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(originalId) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function r2BucketEntry(
	{ binding, bucket_name, remote }: CfR2Bucket,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(bucket_name) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function d1DatabaseEntry(
	{ binding, database_id, preview_database_id, remote }: CfD1Database,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(preview_database_id ?? database_id) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function queueProducerEntry(
	{
		binding,
		queue_name: queueName,
		delivery_delay: deliveryDelay,
		remote,
	}: CfQueue,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		queueName: string;
		deliveryDelay: number | undefined;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { queueName, deliveryDelay }];
	}

	return [binding, { queueName, deliveryDelay, remoteProxyConnectionString }];
}
function pipelineEntry(
	pipeline: CfPipeline,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		pipeline: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !pipeline.remote) {
		return [pipeline.binding, { pipeline: pipeline.pipeline }];
	}
	return [
		pipeline.binding,
		{ pipeline: pipeline.pipeline, remoteProxyConnectionString },
	];
}
function hyperdriveEntry(hyperdrive: CfHyperdrive): [string, string] {
	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
function workflowEntry(
	{
		binding,
		name,
		class_name: className,
		script_name: scriptName,
		remote,
	}: CfWorkflow,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		name: string;
		className: string;
		scriptName?: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !remote) {
		return [
			binding,
			{
				name,
				className,
				scriptName,
			},
		];
	}

	return [
		binding,
		{
			name,
			className,
			scriptName,
			remoteProxyConnectionString,
		},
	];
}
function dispatchNamespaceEntry({
	binding,
	namespace,
	remote,
}: CfDispatchNamespace): [string, { namespace: string }];
function dispatchNamespaceEntry(
	{ binding, namespace, remote }: CfDispatchNamespace,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString: RemoteProxyConnectionString;
	},
];
function dispatchNamespaceEntry(
	{ binding, namespace, remote }: CfDispatchNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { namespace }];
	}
	return [binding, { namespace, remoteProxyConnectionString }];
}
function ratelimitEntry<T extends { name: string }>(ratelimit: T): [string, T] {
	return [ratelimit.name, ratelimit];
}
type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];
function queueConsumerEntry(consumer: QueueConsumer) {
	const options = {
		maxBatchSize: consumer.max_batch_size,
		maxBatchTimeout: consumer.max_batch_timeout,
		maxRetries: consumer.max_retries,
		deadLetterQueue: consumer.dead_letter_queue,
		retryDelay: consumer.retry_delay,
	};
	return [consumer.queue, options] as const;
}

type WorkerOptionsBindings = Pick<
	WorkerOptions,
	| "bindings"
	| "ai"
	| "textBlobBindings"
	| "dataBlobBindings"
	| "wasmBindings"
	| "kvNamespaces"
	| "r2Buckets"
	| "d1Databases"
	| "queueProducers"
	| "queueConsumers"
	| "pipelines"
	| "hyperdrives"
	| "durableObjects"
	| "serviceBindings"
	| "ratelimits"
	| "workflows"
	| "wrappedBindings"
	| "secretsStoreSecrets"
	| "images"
	| "email"
	| "analyticsEngineDatasets"
	| "tails"
	| "streamingTails"
	| "browserRendering"
	| "vectorize"
	| "vpcServices"
	| "dispatchNamespaces"
	| "mtlsCertificates"
	| "helloWorld"
	| "workerLoaders"
	| "unsafeBindings"
	| "additionalUnboundDurableObjects"
	| "media"
	| "versionMetadata"
>;

type MiniflareBindingsConfig = Pick<
	ConfigBundle,
	| "bindings"
	| "migrations"
	| "queueConsumers"
	| "name"
	| "tails"
	| "streamingTails"
	| "complianceRegion"
	| "containerDOClassNames"
	| "containerBuildId"
	| "enableContainers"
> &
	Partial<Pick<ConfigBundle, "format" | "bundle" | "assets">>;

// TODO(someday): would be nice to type these methods more, can we export types for
//  each plugin options schema and use those
export function buildMiniflareBindingOptions(
	config: MiniflareBindingsConfig,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): {
	bindingOptions: WorkerOptionsBindings;
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
	const secretsStoreSecrets = extractBindingsOfType(
		"secrets_store_secret",
		bindings
	);
	const helloWorldBindings = extractBindingsOfType(
		"unsafe_hello_world",
		bindings
	);
	const workerLoaders = extractBindingsOfType("worker_loader", bindings);
	const sendEmailBindings = extractBindingsOfType("send_email", bindings);
	// Extract both regular and unsafe ratelimit bindings
	// Unsafe bindings have type "unsafe_ratelimit" (prefixed with "unsafe_")
	const ratelimits = [
		...extractBindingsOfType("ratelimit", bindings),
		...extractBindingsOfType("unsafe_ratelimit", bindings),
	];
	const aiBindings = extractBindingsOfType("ai", bindings);
	const imagesBindings = extractBindingsOfType("images", bindings);
	const mediaBindings = extractBindingsOfType("media", bindings);
	const browserBindings = extractBindingsOfType("browser", bindings);
	const versionMetadataBindings = extractBindingsOfType(
		"version_metadata",
		bindings
	);
	const fetchers = extractBindingsOfType("fetcher", bindings);

	// Setup blob and module bindings
	// TODO: check all these blob bindings just work, they're relative to cwd
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
		// For the service-worker format, blobs are accessible on the global scope
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

	// Setup service bindings to external services
	const serviceBindings: NonNullable<WorkerOptions["serviceBindings"]> =
		Object.fromEntries(fetchers.map((f) => [f.binding, f.fetcher]));

	for (const service of services) {
		if (remoteProxyConnectionString && service.remote) {
			serviceBindings[service.binding] = {
				name: service.service,
				props: service.props,
				entrypoint: service.entrypoint,
				remoteProxyConnectionString,
			};
			continue;
		}

		serviceBindings[service.binding] = {
			name: service.service,
			entrypoint: service.entrypoint,
			props: service.props,
		};
	}

	const tails: NonNullable<WorkerOptions["tails"]> = [];
	for (const tail of config.tails ?? []) {
		tails.push({ name: tail.service });
	}

	const streamingTails: NonNullable<WorkerOptions["streamingTails"]> = [];
	for (const streamingTail of config.streamingTails ?? []) {
		streamingTails.push({ name: streamingTail.service });
	}

	const classNameToUseSQLite = getDurableObjectClassNameToUseSQLiteMap(
		config.migrations
	);

	const externalWorkers: WorkerOptions[] = [];

	const wrappedBindings: WorkerOptions["wrappedBindings"] = {};

	for (const ai of aiBindings) {
		warnOrError("ai", ai.remote, "always-remote");
	}

	for (const media of mediaBindings) {
		warnOrError("media", media.remote, "always-remote");
	}

	const unsafeBindings: WorkerOptionsBindings["unsafeBindings"] = [];
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

		unsafeBindings.push({
			name,
			type: type.slice("unsafe_".length),
			plugin,
			options: {
				...options,
				...devOptions,
			},
		});
	}

	/**
	 * The `durableObjects` variable contains all DO bindings. However, this
	 * may not represent all DOs defined in the app, because DOs can be defined
	 * without being bound (accessible via ctx.exports).
	 * To get a list of all configured DOS, we need all DOs provisioned via migrations,
	 * which we already have in the form of `classNameToUseSQLite`
	 * As such, this code extends the list of bound DOs with configured DOs that
	 * aren't already referenced. The outcome is that `additionalUnboundDurableObjects` will
	 * contain DOs configured via migrations that are not bound.
	 */
	const additionalUnboundDurableObjects: WorkerOptionsBindings["additionalUnboundDurableObjects"] =
		[];

	for (const [className, useSQLite] of classNameToUseSQLite) {
		if (!durableObjects.find((d) => d.class_name === className)) {
			additionalUnboundDurableObjects.push({
				className,
				scriptName: undefined,
				useSQLite,
				container:
					config.containerDOClassNames?.size && config.enableContainers
						? getImageNameFromDOClassName({
								doClassName: className,
								containerDOClassNames: config.containerDOClassNames,
								containerBuildId: config.containerBuildId,
							})
						: undefined,
			});
		}
	}

	// Build vars from plain_text, secret_text, and json bindings
	const vars: Record<string, Json> = {};
	for (const binding of plainTextBindings) {
		vars[binding.binding] = binding.value;
	}
	for (const binding of secretTextBindings) {
		vars[binding.binding] = binding.value;
	}
	for (const binding of jsonBindings) {
		vars[binding.binding] = binding.value as Json;
	}

	const bindingOptions: WorkerOptionsBindings = {
		bindings: vars,
		versionMetadata: versionMetadataBindings[0]?.binding,
		textBlobBindings,
		dataBlobBindings,
		wasmBindings,
		unsafeBindings,

		ai:
			aiBindings.length > 0
				? {
						binding: aiBindings[0].binding,
						remoteProxyConnectionString,
					}
				: undefined,

		kvNamespaces: Object.fromEntries(
			kvNamespaces.map((kv) =>
				kvNamespaceEntry(kv, remoteProxyConnectionString)
			)
		),

		r2Buckets: Object.fromEntries(
			r2Buckets.map((r2) => r2BucketEntry(r2, remoteProxyConnectionString))
		),
		d1Databases: Object.fromEntries(
			d1Databases.map((d1) => d1DatabaseEntry(d1, remoteProxyConnectionString))
		),
		queueProducers: Object.fromEntries(
			queues.map((queue) =>
				queueProducerEntry(queue, remoteProxyConnectionString)
			)
		),
		queueConsumers: Object.fromEntries(
			config.queueConsumers?.map(queueConsumerEntry) ?? []
		),
		pipelines: Object.fromEntries(
			pipelines.map((pipeline) =>
				pipelineEntry(pipeline, remoteProxyConnectionString)
			)
		),
		hyperdrives: Object.fromEntries(hyperdrives.map(hyperdriveEntry)),
		analyticsEngineDatasets: Object.fromEntries(
			analyticsEngineDatasets.map((binding) => [
				binding.binding,
				{ dataset: binding.dataset ?? "dataset" },
			])
		),
		workflows: Object.fromEntries(
			workflows.map((workflow) =>
				workflowEntry(workflow, remoteProxyConnectionString)
			)
		),
		secretsStoreSecrets: Object.fromEntries(
			secretsStoreSecrets.map((binding) => [binding.binding, binding])
		),
		helloWorld: Object.fromEntries(
			helloWorldBindings.map((binding) => [binding.binding, binding])
		),
		workerLoaders: Object.fromEntries(
			workerLoaders.map(({ binding }) => [binding, {}])
		),
		email: {
			send_email: sendEmailBindings.map(({ type: _type, ...b }) => {
				return {
					...b,
					remoteProxyConnectionString:
						b.remote && remoteProxyConnectionString
							? remoteProxyConnectionString
							: undefined,
				};
			}),
		},
		images:
			imagesBindings.length > 0
				? {
						binding: imagesBindings[0].binding,
						remoteProxyConnectionString:
							imagesBindings[0].remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					}
				: undefined,
		media:
			mediaBindings.length > 0
				? {
						binding: mediaBindings[0].binding,
						remoteProxyConnectionString,
					}
				: undefined,
		browserRendering:
			browserBindings.length > 0
				? {
						binding: browserBindings[0].binding,
						remoteProxyConnectionString:
							remoteProxyConnectionString && browserBindings[0].remote
								? remoteProxyConnectionString
								: undefined,
					}
				: undefined,

		vectorize: Object.fromEntries(
			vectorizeBindings.map((vectorize) => {
				warnOrError("vectorize", vectorize.remote, "remote");
				return [
					vectorize.binding,
					{
						index_name: vectorize.index_name,
						remoteProxyConnectionString:
							vectorize.remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					},
				];
			})
		),
		vpcServices: Object.fromEntries(
			vpcServices.map((vpc) => {
				warnOrError("vpc_service", vpc.remote, "always-remote");
				return [
					vpc.binding,
					{
						service_id: vpc.service_id,
						remoteProxyConnectionString:
							vpc.remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					},
				];
			})
		),

		dispatchNamespaces: Object.fromEntries(
			dispatchNamespaces.map((dispatchNamespace) => {
				warnOrError("dispatch_namespace", dispatchNamespace.remote, "remote");
				return dispatchNamespaceEntry(
					dispatchNamespace,
					dispatchNamespace.remote && remoteProxyConnectionString
						? remoteProxyConnectionString
						: undefined
				);
			})
		),
		durableObjects: Object.fromEntries(
			durableObjects.map(
				({ name, class_name: className, script_name: scriptName }) => {
					return [
						name,
						{
							className,
							scriptName,
							useSQLite: classNameToUseSQLite.get(className),
							container:
								config.containerDOClassNames?.size && config.enableContainers
									? getImageNameFromDOClassName({
											doClassName: className,
											containerDOClassNames: config.containerDOClassNames,
											containerBuildId: config.containerBuildId,
										})
									: undefined,
						},
					];
				}
			)
		),
		additionalUnboundDurableObjects,

		ratelimits: Object.fromEntries(ratelimits.map(ratelimitEntry)),

		mtlsCertificates: Object.fromEntries(
			mtlsCertificates.map((mtlsCertificate) => {
				warnOrError("mtls_certificate", mtlsCertificate.remote, "remote");
				return [
					mtlsCertificate.binding,
					{
						remoteProxyConnectionString:
							mtlsCertificate.remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
						certificate_id: mtlsCertificate.certificate_id,
					},
				];
			})
		),
		serviceBindings,
		wrappedBindings: wrappedBindings,
		tails,
		streamingTails,
	};

	return {
		bindingOptions,
		externalWorkers,
	};
}

export function getDefaultPersistRoot(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): string | undefined {
	if (localPersistencePath !== null) {
		const v3Path = path.join(localPersistencePath, "v3");
		return v3Path;
	}
}

export function buildAssetOptions(config: Pick<ConfigBundle, "assets">) {
	if (config.assets) {
		return {
			assets: {
				directory: config.assets.directory,
				binding: config.assets.binding,
				routerConfig: config.assets.routerConfig,
				assetConfig: config.assets.assetConfig,
			},
		};
	}
}

export function buildSitesOptions({
	legacyAssetPaths,
}: Pick<ConfigBundle, "legacyAssetPaths">) {
	if (legacyAssetPaths !== undefined) {
		const { baseDirectory, assetDirectory, includePatterns, excludePatterns } =
			legacyAssetPaths;
		return {
			sitePath: path.join(baseDirectory, assetDirectory),
			siteInclude: includePatterns.length > 0 ? includePatterns : undefined,
			siteExclude: excludePatterns.length > 0 ? excludePatterns : undefined,
		};
	}
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

	const { sourceOptions, entrypointNames } = await buildSourceOptions(config);
	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		config,
		remoteProxyConnectionString
	);
	const sitesOptions = buildSitesOptions(config);
	const defaultPersistRoot = getDefaultPersistRoot(config.localPersistencePath);
	const assetOptions = buildAssetOptions(config);

	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		inspectorHost: config.inspect ? config.inspectorHost : undefined,
		liveReload: config.liveReload,
		upstream,
		unsafeDevRegistryPath: config.devRegistry,
		unsafeDevRegistryDurableObjectProxy: true,
		unsafeHandleDevRegistryUpdate: onDevRegistryUpdate,
		unsafeProxySharedSecret: proxyToUserWorkerAuthenticationSecret,
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The way we run Miniflare instances with wrangler dev is that there are two:
		//  - one holding the proxy worker,
		//  - and one holding the user worker.
		// The issue with that setup is that end users would see two sets of request logs from Miniflare!
		// Instead of hiding all logs from this Miniflare instance, we specifically hide the request logs,
		// allowing other logs to be shown to the user (such as details about emails being triggered)
		logRequests: false,
		log,
		verbose: logger.loggerLevel === "debug",
		handleStructuredLogs,
		defaultPersistRoot,
		workers: [
			{
				name: getName(config),
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,

				...sourceOptions,
				...bindingOptions,
				...sitesOptions,
				...assetOptions,
				// Allow each entrypoint to be accessed directly over `127.0.0.1:0`
				unsafeDirectSockets: entrypointNames.map((name) => ({
					host: "127.0.0.1",
					port: 0,
					entrypoint: name,
					proxy: true,
				})),
				containerEngine: config.containerEngine,
				zone: config.zone,
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
