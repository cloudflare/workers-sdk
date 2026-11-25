import assert from "node:assert";
import path from "node:path";
import { createContainerDevPlan } from "@cloudflare/containers-shared";
import {
	getWranglerHiddenDirPath,
	getZoneFromRoute,
	UserError,
} from "@cloudflare/workers-utils";
import {
	convertConfigToBindings,
	DEFAULT_MODULE_RULES,
	getAssetsOptions,
	resolveBindingRemote,
	extractBindingsOfType,
	getDurableObjectClassNameToUseSQLiteMap,
	isUnsafeBindingType,
	partitionExports,
	readConfig,
	validateBindingRemoteSetting,
} from "@cloudflare/workers-utils/config";
import { getVarsForDev } from "./dev-vars";
import type { ArtifactsEventSubscription } from "@cloudflare/config";
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
	LegacyAssetPaths,
	Logger,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type {
	ArtifactsEventTrigger,
	Config,
} from "@cloudflare/workers-utils/config";
import type {
	Json,
	RemoteProxyConnectionString,
	V4ModuleRule,
	V4WorkerOptions,
} from "miniflare";

type R2S3Credentials = { accessKeyId: string; secretAccessKey: string };

const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
/** Convert a binding name into a valid JavaScript identifier. */
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
function hyperdriveEntry(
	hyperdrive: CfHyperdrive,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	logger: Logger
):
	| [string, string]
	| [
			string,
			{
				id: string;
				remoteProxyConnectionString: RemoteProxyConnectionString;
			},
	  ] {
	if (hyperdrive.remote && remoteProxyConnectionString) {
		return [
			hyperdrive.binding,
			{
				id: hyperdrive.id,
				remoteProxyConnectionString,
			},
		];
	}

	// Opted into a remote binding, but no remote proxy session is available
	// (not logged in, offline, or remote bindings turned off). There is nothing
	// to tunnel to, so fall back to the local database if one was configured and
	// otherwise explain how to get either half working — without this the empty
	// connection string below fails miniflare's URL validation with an opaque
	// error.
	if (hyperdrive.remote) {
		if (hyperdrive.localConnectionString === undefined) {
			throw new UserError(
				`The Hyperdrive binding "${hyperdrive.binding}" is configured with "remote": true, but no remote connection could be established, and it has no local database to fall back to. Please make sure you are authenticated (run \`wrangler login\`) and connected to the internet so that Wrangler can reach your Hyperdrive configuration, or set the value of the 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${hyperdrive.binding}' variable or "${hyperdrive.binding}"'s "localConnectionString" to a local Postgres connection string.`,
				{
					telemetryMessage:
						"hyperdrive remote binding session and local connection string missing",
				}
			);
		}
		(logger.once?.warn ?? logger.warn)(
			`The Hyperdrive binding "${hyperdrive.binding}" is configured with "remote": true, but no remote connection could be established. Falling back to its "localConnectionString".`
		);
	}

	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
function workflowEntry(
	{
		binding,
		name,
		class_name: className,
		script_name: scriptName,
		limits,
	}: CfWorkflow,
	events: ArtifactsEventSubscription[] | undefined
): [
	string,
	{
		name: string;
		className: string;
		scriptName?: string;
		events?: ArtifactsEventSubscription[];
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
			events,
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
	| "realtimekit"
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
	artifactsEvents?: ArtifactsEventTrigger[];
};

/**
 * Convert Wrangler bindings and local runtime settings into Miniflare options.
 *
 * @returns Options for the Worker and any auxiliary Workers its bindings need.
 */
export function buildMiniflareBindingOptions(
	config: MiniflareBindingsConfig,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	logger: Logger
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
	const realtimekitBindings = extractBindingsOfType("realtimekit", bindings);
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
	const exportedWorkflows = partitionExports(config.exports).workflow;
	const workflowEvents = assignWorkflowEvents(
		config.artifactsEvents,
		config.name,
		exportedWorkflows,
		workflows
	);
	const workflowExports: NonNullable<WorkerOptionsBindings["workflowExports"]> =
		Object.fromEntries(
			Object.entries(exportedWorkflows).map(([className, workflow]) => [
				className,
				{
					name: workflow.name,
					events: workflowEvents.exports.get(className),
					...(workflow.limits?.steps !== undefined && {
						stepLimit: workflow.limits.steps,
					}),
				},
			])
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
		hyperdrives: Object.fromEntries(
			hyperdrives.map((hyperdrive) =>
				hyperdriveEntry(hyperdrive, remoteProxyConnectionString, logger)
			)
		),
		analyticsEngineDatasets: Object.fromEntries(
			analyticsEngineDatasets.map((binding) => [
				binding.binding,
				{
					dataset: binding.dataset ?? "dataset",
					...(remoteProxyConnectionString &&
						binding.remote && { remoteProxyConnectionString }),
				},
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
				return workflowEntry(
					workflow,
					workflowEvents.bindings.get(workflow.binding)
				);
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
		realtimekit: Object.fromEntries(
			realtimekitBindings.map((realtimekit) => {
				validateBindingRemoteSetting(
					"realtimekit",
					realtimekit.remote,
					logger.warn
				);
				return [
					realtimekit.binding,
					{
						app_id: realtimekit.app_id,
						remoteProxyConnectionString:
							realtimekit.remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					},
				];
			})
		),
		artifacts: Object.fromEntries(
			artifactsBindings.map((binding) => [
				binding.binding,
				{
					namespace: binding.namespace,
					remoteProxyConnectionString: resolveBindingRemote(
						"artifacts",
						binding.remote
					)
						? remoteProxyConnectionString
						: undefined,
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

/** Return the project-local directory used for temporary development files. */
export function getDefaultProjectTmpPath(projectRoot: string): string {
	return path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
}

/** Convert validated static asset settings into Miniflare asset options. */
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

/** Convert legacy Workers Sites settings into Miniflare site options. */
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
function applyHyperdriveEnvVars(
	config: Config,
	local: boolean,
	logger: Logger
): void {
	for (const hyperdrive of config.hyperdrive ?? []) {
		const prefix = `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;
		const deprecatedPrefix = `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_`;

		let varName = `${prefix}${hyperdrive.binding}`;
		let connectionStringFromEnv = process.env[varName];

		if (!connectionStringFromEnv) {
			varName = `${deprecatedPrefix}${hyperdrive.binding}`;
			connectionStringFromEnv = process.env[varName];
		}

		// only require a local connection string in the wrangler file or the env
		// if not using dev --remote, and not opted into a remote Hyperdrive
		// binding (which tunnels to the edge instead of a local database)
		if (
			local &&
			!hyperdrive.remote &&
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
				(logger.once?.warn ?? logger.warn)(
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
 * @param defaultBindings Bindings used unless the config or caller overrides them
 * @returns The bindings for the Cloudflare Worker.
 */
export function getBindings(
	configParam: Config,
	env: string | undefined,
	envFiles: string[] | undefined,
	local: boolean,
	inputBindings: StartDevWorkerInput["bindings"],
	defaultBindings: StartDevWorkerInput["bindings"],
	logger: Logger
): StartDevWorkerInput["bindings"] {
	applyHyperdriveEnvVars(configParam, local, logger);

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
		{ silent: false, secrets, logger }
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

/** Caller-owned logging and local development overrides. */
export interface MiniflareWorkerOptionsOptions {
	logger: Logger;
	envFiles?: string[];
	remoteProxyConnectionString?: RemoteProxyConnectionString;
	overrides?: {
		assets?: Partial<AssetsOptions>;
		enableContainers?: boolean;
	};
	containerBuildId?: string;
}

/**
 * Resolve a Wrangler configuration into the options needed to run it in Miniflare.
 *
 * @param configOrConfigPath The loaded configuration or path to its file.
 * @param env Optional named Wrangler environment.
 * @param options The caller's logger, local bindings, container and asset overrides.
 * @returns Worker options, auxiliary Workers, defines and the entrypoint.
 */
export function getMiniflareWorkerOptions(
	configOrConfigPath: string | Config,
	env: string | undefined,
	options: MiniflareWorkerOptionsOptions
): MiniflareWorkerOptions {
	const { logger } = options;
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
		undefined,
		logger
	);

	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		{
			name: config.name,
			complianceRegion: config.compliance_region,
			bindings,
			queueConsumers: config.queues.consumers,
			artifactsEvents: config.triggers.events,
			migrations: config.migrations,
			exports: config.exports,
			tails: config.tail_consumers,
			streamingTails: config.streaming_tail_consumers,
			containerRuntimeOptions: containerPlan?.containerRuntimeOptions,
			enableContainers,
		},
		options?.remoteProxyConnectionString,
		logger
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
		? getAssetsOptions(
				{
					args: {
						assets: undefined,
					},
					config,
					// For getPlatformProxy we don't need to validate the directory's existence
					validateDirectoryExistence: false,
					overrides: options?.overrides?.assets,
				},
				logger
			)
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

interface WorkflowEventAssignment {
	exports: Map<string, ArtifactsEventSubscription[]>;
	bindings: Map<string, ArtifactsEventSubscription[]>;
}

/**
 * Gives each `triggers.events` target to the one local declaration of its
 * Workflow: the export when there is one, otherwise the first local binding.
 * Miniflare starts a subscription for every declaration it receives, so a
 * Workflow declared both ways must not receive its events twice.
 *
 * @throws {UserError} If a target is not a Workflow this Worker defines,
 * matching the check `wrangler deploy` makes.
 */
function assignWorkflowEvents(
	triggers: ArtifactsEventTrigger[] | undefined,
	scriptName: string | undefined,
	exportedWorkflows: Record<string, { name: string }>,
	workflowBindings: CfWorkflow[]
): WorkflowEventAssignment {
	const assignment: WorkflowEventAssignment = {
		exports: new Map(),
		bindings: new Map(),
	};
	if (!triggers?.length) {
		return assignment;
	}
	const owners = new Map<string, ArtifactsEventSubscription[]>();
	for (const [className, { name }] of Object.entries(exportedWorkflows)) {
		if (!owners.has(name)) {
			const events: ArtifactsEventSubscription[] = [];
			owners.set(name, events);
			assignment.exports.set(className, events);
		}
	}
	for (const workflow of workflowBindings) {
		const local =
			workflow.script_name === undefined || workflow.script_name === scriptName;
		if (local && !owners.has(workflow.name)) {
			const events: ArtifactsEventSubscription[] = [];
			owners.set(workflow.name, events);
			assignment.bindings.set(workflow.binding, events);
		}
	}
	for (const trigger of triggers) {
		for (const target of trigger.targets) {
			const events = owners.get(target.workflow_name);
			if (events === undefined) {
				throw new UserError(
					`Event trigger "${trigger.type}" targets Workflow "${target.workflow_name}", but that Workflow is not defined by this Worker.\n\nAdd it to the "workflows" configuration or remove the event trigger target.`,
					{ telemetryMessage: "dev event target workflow not defined" }
				);
			}
			events.push({
				type: trigger.type,
				...(trigger.filter === undefined
					? {}
					: {
							filter: {
								namespace: trigger.filter.namespace,
								repoName: trigger.filter.repo_name,
							},
						}),
			});
		}
	}
	return assignment;
}
