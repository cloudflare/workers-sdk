import assert from "node:assert";
import path from "node:path";
import { createContainerDevPlan } from "@cloudflare/containers-shared";
import {
	convertConfigToBindings,
	extractBindingsOfType,
	getDurableObjectClassNameToUseSQLiteMap,
	getWranglerHiddenDirPath,
	getZoneFromRoute,
	isUnsafeBindingType,
	partitionExports,
	readConfig,
	UserError,
	validateBindingRemoteSetting,
} from "@cloudflare/workers-utils";
import { getAssetsOptions } from "../deploy/helpers/assets";
import { logger } from "../shared/context";
import { getVarsForDev } from "./dev-vars";
import type { ContainerDevRuntimeOptions } from "@cloudflare/containers-shared";
import type {
	AssetsOptions,
	Binding,
	CfD1Database,
	CfDispatchNamespace,
	CfFlagship,
	CfHyperdrive,
	CfKvNamespace,
	CfModule,
	CfPipeline,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfWorkflow,
	Config,
	LegacyAssetPaths,
	Rule,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type {
	Json,
	RemoteProxyConnectionString,
	V4ModuleRule,
	V4WorkerOptions,
} from "miniflare";

type R2S3Credentials = { accessKeyId: string; secretAccessKey: string };

export const DEFAULT_MODULE_RULES: Rule[] = [
	{ type: "Text", globs: ["**/*.txt", "**/*.html", "**/*.sql"] },
	{ type: "Data", globs: ["**/*.bin"] },
	{ type: "CompiledWasm", globs: ["**/*.wasm", "**/*.wasm?module"] },
];

const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
export function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
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
function flagshipEntry(
	{ binding, app_id, remote }: CfFlagship,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ app_id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(app_id) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { app_id: id }];
	}
	return [binding, { app_id: id, remoteProxyConnectionString }];
}

function r2BucketEntry(
	{ binding, bucket_name, remote, local_dev }: CfR2Bucket,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		id: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		s3Credentials?: R2S3Credentials;
	},
] {
	const id = getRemoteId(bucket_name) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [
			binding,
			{ id, s3Credentials: local_dev?.experimental_s3_credentials },
		];
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
	const concreteQueueName = getRemoteId(queueName) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { queueName: concreteQueueName, deliveryDelay }];
	}

	return [
		binding,
		{
			queueName: concreteQueueName,
			deliveryDelay,
			remoteProxyConnectionString,
		},
	];
}
function pipelineEntry(
	{ binding, stream, pipeline, remote }: CfPipeline,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	(
		| {
				stream: string;
				remoteProxyConnectionString?: RemoteProxyConnectionString;
		  }
		| {
				pipeline: string;
				remoteProxyConnectionString?: RemoteProxyConnectionString;
		  }
	),
] {
	if (stream) {
		return [
			binding,
			{
				stream,
				...(remoteProxyConnectionString &&
					remote && { remoteProxyConnectionString }),
			},
		];
	} else if (pipeline) {
		return [
			binding,
			{
				pipeline,
				...(remoteProxyConnectionString &&
					remote && { remoteProxyConnectionString }),
			},
		];
	} else {
		throw new Error("Pipeline must have either a stream");
	}
}
function hyperdriveEntry(hyperdrive: CfHyperdrive): [string, string] {
	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
function workflowEntry({
	binding,
	name,
	class_name: className,
	script_name: scriptName,
	limits,
}: CfWorkflow): [
	string,
	{
		name: string;
		className: string;
		scriptName?: string;
		stepLimit?: number;
	},
] {
	const stepLimit = limits?.steps;

	return [
		binding,
		{
			name,
			className,
			scriptName,
			...(stepLimit !== undefined && { stepLimit }),
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
	const concreteNamespace = getRemoteId(namespace) ?? binding;
	if (!remoteProxyConnectionString || !remote) {
		return [binding, { namespace: concreteNamespace }];
	}
	return [
		binding,
		{ namespace: concreteNamespace, remoteProxyConnectionString },
	];
}
function ratelimitEntry<T extends { name: string; namespace_id?: string }>(
	ratelimit: T
): [string, T & { namespace_id: string }] {
	// Miniflare keys rate-limit counters by namespace_id. Regular `ratelimit`
	// bindings always carry one; freeform `unsafe_ratelimit` bindings may not,
	// so fall back to the binding name to preserve per-binding isolation.
	return [
		ratelimit.name,
		{ ...ratelimit, namespace_id: ratelimit.namespace_id ?? ratelimit.name },
	];
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
	V4WorkerOptions,
	| "bindings"
	| "ai"
	| "aiSearchNamespaces"
	| "aiSearchInstances"
	| "agentMemory"
	| "analyticsSql"
	| "textBlobBindings"
	| "dataBlobBindings"
	| "wasmBindings"
	| "kvNamespaces"
	| "r2Buckets"
	| "d1Databases"
	| "queueProducers"
	| "queueConsumers"
	| "pipelines"
	| "k2"
	| "hyperdrives"
	| "durableObjects"
	| "serviceBindings"
	| "ratelimits"
	| "workflows"
	| "workflowExports"
	| "secretsStoreSecrets"
	| "images"
	| "email"
	| "analyticsEngineDatasets"
	| "tails"
	| "streamingTails"
	| "browserRendering"
	| "vectorize"
	| "vpcServices"
	| "vpcNetworks"
	| "dispatchNamespaces"
	| "mtlsCertificates"
	| "helloWorld"
	| "flagship"
	| "artifacts"
	| "workerLoaders"
	| "unsafeBindings"
	| "additionalUnboundDurableObjects"
	| "media"
	| "versionMetadata"
	| "stream"
>;

type MiniflareBindingsConfig = {
	name: string | undefined;
	complianceRegion: Config["compliance_region"] | undefined;
	bindings: StartDevWorkerInput["bindings"];
	migrations: Config["migrations"] | undefined;
	exports: Config["exports"] | undefined;
	queueConsumers: Config["queues"]["consumers"];
	tails: Config["tail_consumers"] | undefined;
	streamingTails: Config["streaming_tail_consumers"] | undefined;
	containerRuntimeOptions?: Map<string, ContainerDevRuntimeOptions>;
	enableContainers: boolean;
	format?: CfScriptFormat | undefined;
	bundle?: { path: string; modules: CfModule[] };
	assets?: AssetsOptions | undefined;
	compatibilityFlags?: string[] | undefined;
};

// TODO(someday): would be nice to type these methods more, can we export types for
//  each plugin options schema and use those
export function buildMiniflareBindingOptions(
	config: MiniflareBindingsConfig,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined
): {
	bindingOptions: WorkerOptionsBindings;
	externalWorkers: V4WorkerOptions[];
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
	const k2 = extractBindingsOfType("k2", bindings);
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
	const agentMemoryBindings = extractBindingsOfType("agent_memory", bindings);
	const analyticsSqlBindings = extractBindingsOfType("analytics", bindings);
	const imagesBindings = extractBindingsOfType("images", bindings);
	const mediaBindings = extractBindingsOfType("media", bindings);
	const browserBindings = extractBindingsOfType("browser", bindings);
	const versionMetadataBindings = extractBindingsOfType(
		"version_metadata",
		bindings
	);
	const streamBindings = extractBindingsOfType("stream", bindings);
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
	const serviceBindings: NonNullable<V4WorkerOptions["serviceBindings"]> =
		Object.fromEntries(fetchers.map((f) => [f.binding, f.fetcher]));

	const unsafeBindings: WorkerOptionsBindings["unsafeBindings"] = [];

	for (const service of services) {
		// A `dev` plugin overrides the regular service binding and routes the binding through Miniflare's external-plugin pathway instead.
		if (service.dev !== undefined) {
			const {
				binding: _binding,
				dev: { plugin, options: devOptions },
				remote: _remote,
				props: _props,
				...options
			} = service;

			logger.debug(
				`Binding ${service.binding} is a local binding to plugin ${plugin.name} provided by package ${plugin.package}`
			);

			unsafeBindings.push({
				name: service.binding,
				type: "service",
				plugin,
				options: { ...options, ...devOptions },
			});

			continue;
		}

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

	const tails: NonNullable<V4WorkerOptions["tails"]> = [];
	for (const tail of config.tails ?? []) {
		tails.push({ name: tail.service });
	}

	const streamingTails: NonNullable<V4WorkerOptions["streamingTails"]> = [];
	for (const streamingTail of config.streamingTails ?? []) {
		streamingTails.push({ name: streamingTail.service });
	}

	const classNameToUseSQLite = getDurableObjectClassNameToUseSQLiteMap(
		config.migrations,
		config.exports
	);

	const externalWorkers: V4WorkerOptions[] = [];

	for (const ai of aiBindings) {
		validateBindingRemoteSetting("ai", ai.remote, logger.warn);
	}

	for (const ns of aiSearchNamespaceBindings) {
		validateBindingRemoteSetting("ai_search_namespace", ns.remote, logger.warn);
	}

	for (const inst of aiSearchInstanceBindings) {
		validateBindingRemoteSetting("ai_search", inst.remote, logger.warn);
	}

	for (const memory of agentMemoryBindings) {
		validateBindingRemoteSetting("agent_memory", memory.remote, logger.warn);
	}

	for (const analytics of analyticsSqlBindings) {
		validateBindingRemoteSetting("analytics", analytics.remote, logger.warn);
	}

	for (const media of mediaBindings) {
		validateBindingRemoteSetting("media", media.remote, logger.warn);
	}

	for (const artifact of artifactsBindings) {
		validateBindingRemoteSetting("artifacts", artifact.remote, logger.warn);
	}

	for (const flagship of flagshipBindings) {
		validateBindingRemoteSetting("flagship", flagship.remote, logger.warn);
	}

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
				container: config.enableContainers
					? config.containerRuntimeOptions?.get(className)
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

	// Workflows declared under `exports` (accessible via `ctx.exports`) are
	// carried to Miniflare separately from `workflows[]` env bindings, keyed by
	// the exported class name.
	const workflowExports: NonNullable<WorkerOptionsBindings["workflowExports"]> =
		Object.fromEntries(
			Object.entries(partitionExports(config.exports).workflow).map(
				([className, workflow]) => [
					className,
					{
						name: workflow.name,
						...(workflow.limits?.steps !== undefined && {
							stepLimit: workflow.limits.steps,
						}),
					},
				]
			)
		);

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

		aiSearchNamespaces: Object.fromEntries(
			aiSearchNamespaceBindings.map((ns) => [
				ns.binding,
				{
					namespace: ns.namespace as string,
					remoteProxyConnectionString,
				},
			])
		),

		aiSearchInstances: Object.fromEntries(
			aiSearchInstanceBindings.map((inst) => [
				inst.binding,
				{
					instance_name: inst.instance_name,
					remoteProxyConnectionString,
				},
			])
		),

		agentMemory: Object.fromEntries(
			agentMemoryBindings.map((memory) => [
				memory.binding,
				{
					namespace: memory.namespace as string,
					remoteProxyConnectionString,
				},
			])
		),

		analyticsSql:
			analyticsSqlBindings.length > 0
				? {
						binding: analyticsSqlBindings[0].binding,
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
		k2: Object.fromEntries(
			k2.map(({ binding, stream, remote }) => {
				validateBindingRemoteSetting("k2", remote, logger.warn);
				return [
					binding,
					{
						stream,
						...(remoteProxyConnectionString && { remoteProxyConnectionString }),
					},
				];
			})
		),
		hyperdrives: Object.fromEntries(hyperdrives.map(hyperdriveEntry)),
		analyticsEngineDatasets: Object.fromEntries(
			analyticsEngineDatasets.map((binding) => [
				binding.binding,
				{ dataset: binding.dataset ?? "dataset" },
			])
		),
		workflows: Object.fromEntries(
			workflows.map((workflow) => {
				if (
					workflow.script_name !== undefined &&
					workflow.script_name !== config.name
				) {
					if (workflow.limits) {
						throw new UserError(
							`Workflow "${workflow.name}" has "limits" configured but references external script "${workflow.script_name}". ` +
								`Configure limits on the worker that defines the workflow.`,
							{ telemetryMessage: "workflow limits on external script" }
						);
					}
					if (workflow.concurrency) {
						throw new UserError(
							`Workflow "${workflow.name}" has "concurrency" configured but references external script "${workflow.script_name}". ` +
								`Configure concurrency on the worker that defines the workflow.`,
							{ telemetryMessage: "workflow concurrency on external script" }
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
				return workflowEntry(workflow);
			})
		),
		workflowExports,
		secretsStoreSecrets: Object.fromEntries(
			secretsStoreSecrets.map((binding) => [binding.binding, binding])
		),
		helloWorld: Object.fromEntries(
			helloWorldBindings.map((binding) => [binding.binding, binding])
		),
		flagship: Object.fromEntries(
			flagshipBindings.map((binding) =>
				flagshipEntry(binding, remoteProxyConnectionString)
			)
		),
		artifacts: Object.fromEntries(
			artifactsBindings.map((binding) => [
				binding.binding,
				{
					namespace: binding.namespace,
					remoteProxyConnectionString,
				},
			])
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
		stream:
			streamBindings.length > 0
				? {
						binding: streamBindings[0].binding,
						remoteProxyConnectionString:
							streamBindings[0].remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					}
				: undefined,

		vectorize: Object.fromEntries(
			vectorizeBindings.map((vectorize) => {
				validateBindingRemoteSetting(
					"vectorize",
					vectorize.remote,
					logger.warn
				);
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
				validateBindingRemoteSetting("vpc_service", vpc.remote, logger.warn);
				return [
					vpc.binding,
					{
						service_id: vpc.service_id,
						remoteProxyConnectionString,
					},
				];
			})
		),
		vpcNetworks: Object.fromEntries(
			vpcNetworks.map((vpc) => {
				validateBindingRemoteSetting("vpc_network", vpc.remote, logger.warn);
				const id =
					vpc.tunnel_id !== undefined
						? { tunnel_id: vpc.tunnel_id }
						: { network_id: vpc.network_id as string };
				return [vpc.binding, { ...id, remoteProxyConnectionString }];
			})
		),

		dispatchNamespaces: Object.fromEntries(
			dispatchNamespaces.map((dispatchNamespace) => {
				validateBindingRemoteSetting(
					"dispatch_namespace",
					dispatchNamespace.remote,
					logger.warn
				);
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
							container: config.enableContainers
								? config.containerRuntimeOptions?.get(className)
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
				validateBindingRemoteSetting(
					"mtls_certificate",
					mtlsCertificate.remote,
					logger.warn
				);
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
		tails,
		streamingTails,
	};

	return {
		bindingOptions,
		externalWorkers,
	};
}

export function getDefaultProjectTmpPath(projectRoot: string): string {
	return path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
}

export function buildAssetOptions(config: {
	assets: AssetsOptions | undefined;
}) {
	if (config.assets) {
		return {
			assets: {
				directory: config.assets.directory,
				binding: config.assets.binding,
				run_worker_first: config.assets.run_worker_first,
				routerConfig: config.assets.routerConfig,
				assetConfig: config.assets.assetConfig,
			},
		};
	}
}

export function buildSitesOptions({
	legacyAssetPaths,
}: {
	legacyAssetPaths: LegacyAssetPaths | undefined;
}) {
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
 * Apply Hyperdrive connection string environment variables to config.
 * Checks for CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_* env vars
 * and applies them to the config's hyperdrive bindings.
 */
function applyHyperdriveEnvVars(config: Config, local: boolean): void {
	for (const hyperdrive of config.hyperdrive ?? []) {
		const prefix = `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;
		const deprecatedPrefix = `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;

		let varName = `${prefix}${hyperdrive.binding}`;
		let connectionStringFromEnv = process.env[varName];

		if (!connectionStringFromEnv) {
			varName = `${deprecatedPrefix}${hyperdrive.binding}`;
			connectionStringFromEnv = process.env[varName];
		}

		// only require a local connection string in the wrangler file or the env if not using dev --remote
		if (
			local &&
			connectionStringFromEnv === undefined &&
			hyperdrive.localConnectionString === undefined
		) {
			throw new UserError(
				`When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality. Please setup Postgres locally and set the value of the '${prefix}${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to the Postgres connection string.`,
				{ telemetryMessage: "no local hyperdrive connection string" }
			);
		}

		// If there is a non-empty connection string specified in the environment,
		// use that as our local connection string configuration.
		if (connectionStringFromEnv) {
			if (varName.startsWith(deprecatedPrefix)) {
				(logger.once ?? logger).warn(
					`Using "${deprecatedPrefix}<BINDING_NAME>" environment variable. This is deprecated. Please use "${prefix}<BINDING_NAME>" instead.`
				);
			}
			logger.log(
				`Found a non-empty ${varName} variable for binding. Hyperdrive will connect to this database during local development.`
			);
			hyperdrive.localConnectionString = connectionStringFromEnv;
		}
	}
}

/**
 * Gets the bindings for the Cloudflare Worker.
 *
 * @param configParam The loaded configuration.
 * @param env The environment to use, if any.
 * @param envFiles An array of paths, relative to the project directory, of .env files to load.
 * If `undefined` it defaults to the standard .env files from `getDefaultEnvFiles()`.
 * @param local Whether the dev server should run locally.
 * @param inputBindings Additional bindings to merge on top of config bindings
 * @returns The bindings for the Cloudflare Worker.
 */
export function getBindings(
	configParam: Config,
	env: string | undefined,
	envFiles: string[] | undefined,
	local: boolean,
	inputBindings: StartDevWorkerInput["bindings"],
	defaultBindings: StartDevWorkerInput["bindings"]
): StartDevWorkerInput["bindings"] {
	applyHyperdriveEnvVars(configParam, local);

	const bindings = convertConfigToBindings(configParam, {
		usePreviewIds: true,
	});

	// createTestHarness() can override secrets through inputBindings.
	// This filters out those required secrets so the logic doesn't consider them missing
	const secrets = configParam.secrets
		? {
				...configParam.secrets,
				required: configParam.secrets?.required?.filter(
					(secret) => inputBindings?.[secret]?.type !== "secret_text"
				),
			}
		: undefined;
	// Override vars with .dev.vars (dev-specific)
	// getVarsForDev returns typed bindings: config vars are plain_text/json,
	// while .dev.vars/.env vars are secret_text.
	// When secrets is defined, only declared secret keys are loaded from files.
	const vars = getVarsForDev(
		configParam.userConfigPath,
		envFiles,
		configParam.vars,
		env,
		false,
		secrets
	);
	for (const [name, binding] of Object.entries(vars)) {
		// Only override plain_text/json/secret_text vars, not other binding types like kv_namespace
		const existingBinding = bindings[name];
		if (
			!existingBinding ||
			existingBinding.type === "plain_text" ||
			existingBinding.type === "json" ||
			existingBinding.type === "secret_text"
		) {
			bindings[name] = binding;
		}
	}

	return { ...defaultBindings, ...bindings, ...inputBindings };
}

/**
 * Get an object that describes what site assets to upload, if any.
 *
 * Uses the args (passed from the command line) if available,
 * falling back to those defined in the config.
 *
 * (This function corresponds to --site/config.site)
 *
 */
export function getSiteAssetPaths(
	config: Config,
	assetDirectory?: string,
	includePatterns = config.site?.include ?? [],
	excludePatterns = config.site?.exclude ?? []
): LegacyAssetPaths | undefined {
	const baseDirectory = assetDirectory
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));

	assetDirectory ??= config.site?.bucket;

	if (assetDirectory) {
		return {
			baseDirectory,
			assetDirectory,
			includePatterns,
			excludePatterns,
		};
	} else {
		return undefined;
	}
}

/**
 * Derive the zone value used for the outbound `CF-Worker` header from a
 * normalized Wrangler config, for callers outside of `wrangler dev`
 * (`getPlatformProxy`, `getMiniflareWorkerOptions`).
 *
 * Falls back to the zone of the first configured route (via
 * {@link getZoneFromRoute}, which prefers the route's `zone_name` field
 * when present and otherwise falls back to the pattern's hostname), or
 * `undefined` if no routes are set — in which case Miniflare keeps its
 * default of `${workerName}.example.com`.
 *
 * `dev.host` is intentionally NOT consulted here: the `dev` config block is
 * specific to `wrangler dev` and should not influence behaviour under
 * `@cloudflare/vite-plugin`, `@cloudflare/vitest-plugin`, or
 * `getPlatformProxy`. Users who need a custom `CF-Worker` host in those
 * environments should configure a `route` instead.
 */
export function getZoneFromConfig(config: Config): string | undefined {
	const firstRoute = config.route ?? config.routes?.[0];
	if (firstRoute) {
		return getZoneFromRoute(firstRoute);
	}
	return undefined;
}

export type SourcelessWorkerOptions = Omit<
	V4WorkerOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
> & { modulesRules?: V4ModuleRule[] };

export interface MiniflareWorkerOptions {
	workerOptions: SourcelessWorkerOptions;
	define: Record<string, string>;
	main?: string;
	externalWorkers: V4WorkerOptions[];
}

export function getMiniflareWorkerOptions(
	configPath: string,
	env?: string,
	options?: {
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): MiniflareWorkerOptions;
export function getMiniflareWorkerOptions(
	config: Config,
	env?: string,
	options?: {
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): MiniflareWorkerOptions;
export function getMiniflareWorkerOptions(
	configOrConfigPath: string | Config,
	env?: string,
	options?: {
		envFiles?: string[];
		remoteProxyConnectionString?: RemoteProxyConnectionString;
		overrides?: {
			assets?: Partial<AssetsOptions>;
			enableContainers?: boolean;
		};
		containerBuildId?: string;
	}
): MiniflareWorkerOptions {
	const config =
		typeof configOrConfigPath === "string"
			? readConfig({ config: configOrConfigPath, env }, { logger })
			: configOrConfigPath;

	const modulesRules: V4ModuleRule[] = config.rules
		.concat(DEFAULT_MODULE_RULES)
		.map((rule) => ({
			type: rule.type,
			include: rule.globs,
			fallthrough: rule.fallthrough,
		}));

	const enableContainers =
		options?.overrides?.enableContainers !== undefined
			? options.overrides.enableContainers
			: config.dev.enable_containers;
	const containerPlan = enableContainers
		? createContainerDevPlan({
				containers: config.containers,
				exports: config.exports,
				containerBuildId: options?.containerBuildId,
				configPath: config.configPath,
			})
		: undefined;
	const bindings = getBindings(
		config,
		env,
		options?.envFiles,
		true,
		undefined,
		undefined
	);

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		{
			name: config.name,
			complianceRegion: config.compliance_region,
			bindings,
			queueConsumers: config.queues.consumers,
			migrations: config.migrations,
			exports: config.exports,
			tails: config.tail_consumers,
			streamingTails: config.streaming_tail_consumers,
			containerRuntimeOptions: containerPlan?.containerRuntimeOptions,
			enableContainers,
		},
		options?.remoteProxyConnectionString
	);

	const sitesAssetPaths = getSiteAssetPaths(config);
	const sitesOptions = buildSitesOptions({ legacyAssetPaths: sitesAssetPaths });
	const projectRoot = config.userConfigPath
		? path.dirname(config.userConfigPath)
		: process.cwd();
	// Only resolve assets if a directory is available (from config or overrides).
	// When assets are configured without a directory (e.g. when using
	// @cloudflare/vite-plugin, which handles asset serving independently),
	// there's nothing for Miniflare to serve, so skip asset setup entirely.
	const hasAssetsDirectory =
		config.assets?.directory || options?.overrides?.assets?.directory;
	const processedAssetOptions = hasAssetsDirectory
		? getAssetsOptions({
				args: {
					assets: undefined,
				},
				config,
				// For getPlatformProxy we don't need to validate the directory's existence
				validateDirectoryExistence: false,
				overrides: options?.overrides?.assets,
			})
		: undefined;
	const assetOptions = processedAssetOptions
		? buildAssetOptions({ assets: processedAssetOptions })
		: {};

	const workerOptions: SourcelessWorkerOptions = {
		rootPath: projectRoot,
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		modulesRules,
		zone: getZoneFromConfig(config),
		access: config.access?.dev,
		connectHandlers: config.connect.map((handler) => ({
			protocol: handler.protocol,
			port: handler.port,
			address: handler.address,
			...(handler.protocol === "udp"
				? {
						idleTimeoutMs: handler.idle_timeout_ms,
						maxPendingBytes: handler.max_pending_bytes,
					}
				: {}),
		})),
		cronTriggers: config.triggers.crons,

		...bindingOptions,
		...sitesOptions,
		...assetOptions,
	};

	return {
		workerOptions,
		define: config.define,
		main: config.main,
		externalWorkers,
	};
}
