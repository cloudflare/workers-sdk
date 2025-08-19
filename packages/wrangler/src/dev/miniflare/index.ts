import assert from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import { Log, LogLevel } from "miniflare";
import {
	EXTERNAL_AI_WORKER_NAME,
	EXTERNAL_AI_WORKER_SCRIPT,
	getAIFetcher,
} from "../../ai/fetcher";
import { ModuleTypeToRuleType } from "../../deployment-bundle/module-collection";
import { withSourceURLs } from "../../deployment-bundle/source-url";
import {
	EXTERNAL_IMAGES_WORKER_NAME,
	EXTERNAL_IMAGES_WORKER_SCRIPT,
	getImagesRemoteFetcher,
} from "../../images/fetcher";
import { logger } from "../../logger";
import { updateCheck } from "../../update-check";
import { warnOrError } from "../../utils/print-bindings";
import {
	EXTERNAL_VECTORIZE_WORKER_NAME,
	EXTERNAL_VECTORIZE_WORKER_SCRIPT,
	MakeVectorizeFetcher,
} from "../../vectorize/fetcher";
import { getClassNamesWhichUseSQLite } from "../class-names-sqlite";
import { handleRuntimeStdioWithStructuredLogs } from "./stdio";
import type { ServiceFetch } from "../../api";
import type { AssetsOptions } from "../../assets";
import type { Config } from "../../config";
import type { ContainerEngine } from "../../config/environment";
import type {
	CfD1Database,
	CfDispatchNamespace,
	CfHyperdrive,
	CfKvNamespace,
	CfPipeline,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfUnsafeBinding,
	CfWorkerInit,
	CfWorkflow,
} from "../../deployment-bundle/worker";
import type { LoggerLevel } from "../../logger";
import type { LegacyAssetPaths } from "../../sites";
import type { EsbuildBundle } from "../use-esbuild";
import type {
	DOContainerOptions,
	MiniflareOptions,
	RemoteProxyConnectionString,
	SourceOptions,
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
	bindings: CfWorkerInit["bindings"];
	migrations: Config["migrations"] | undefined;
	devRegistry: string | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
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
	services: Config["services"] | undefined;
	tails: Config["tail_consumers"] | undefined;
	serviceBindings: Record<string, ServiceFetch>;
	bindVectorizeToProd: boolean;
	imagesLocalMode: boolean;
	testScheduled: boolean;
	containerDOClassNames: Set<string> | undefined;
	containerBuildId: string | undefined;
	containerEngine: ContainerEngine | undefined;
	enableContainers: boolean;
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

		const modulesRoot = path.dirname(scriptPath);
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
	{ binding, id: originalId, experimental_remote }: CfKvNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(originalId) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function r2BucketEntry(
	{ binding, bucket_name, experimental_remote }: CfR2Bucket,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(bucket_name) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function d1DatabaseEntry(
	{
		binding,
		database_id,
		preview_database_id,
		experimental_remote,
	}: CfD1Database,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(preview_database_id ?? database_id) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function queueProducerEntry(
	{
		binding,
		queue_name: queueName,
		delivery_delay: deliveryDelay,
		experimental_remote,
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
	if (!remoteProxyConnectionString || !experimental_remote) {
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
	if (!remoteProxyConnectionString || !pipeline.experimental_remote) {
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
		experimental_remote,
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
	if (!remoteProxyConnectionString || !experimental_remote) {
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
	experimental_remote,
}: CfDispatchNamespace): [string, { namespace: string }];
function dispatchNamespaceEntry(
	{ binding, namespace, experimental_remote }: CfDispatchNamespace,
	remoteProxyConnectionString: RemoteProxyConnectionString
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString: RemoteProxyConnectionString;
	},
];
function dispatchNamespaceEntry(
	{ binding, namespace, experimental_remote }: CfDispatchNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { namespace }];
	}
	return [binding, { namespace, remoteProxyConnectionString }];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ratelimitEntry(ratelimit: CfUnsafeBinding): [string, any] {
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
	| "browserRendering"
	| "vectorize"
	| "dispatchNamespaces"
	| "mtlsCertificates"
	| "helloWorld"
	| "workerLoaders"
>;

type MiniflareBindingsConfig = Pick<
	ConfigBundle,
	| "bindings"
	| "migrations"
	| "queueConsumers"
	| "name"
	| "services"
	| "serviceBindings"
	| "imagesLocalMode"
	| "tails"
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
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	remoteBindingsEnabled: boolean
): {
	bindingOptions: WorkerOptionsBindings;
	externalWorkers: WorkerOptions[];
} {
	const bindings = config.bindings;

	// Setup blob and module bindings
	// TODO: check all these blob bindings just work, they're relative to cwd
	const textBlobBindings = { ...bindings.text_blobs };
	const dataBlobBindings = { ...bindings.data_blobs };
	const wasmBindings = { ...bindings.wasm_modules };
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
	const serviceBindings: NonNullable<WorkerOptions["serviceBindings"]> = {
		...config.serviceBindings,
	};

	for (const service of config.services ?? []) {
		if (remoteProxyConnectionString && service.experimental_remote) {
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

	const classNameToUseSQLite = getClassNamesWhichUseSQLite(config.migrations);

	const durableObjects = bindings.durable_objects?.bindings ?? [];

	const externalWorkers: WorkerOptions[] = [];

	const wrappedBindings: WorkerOptions["wrappedBindings"] = {};
	if (bindings.ai?.binding && !remoteBindingsEnabled) {
		externalWorkers.push({
			name: `${EXTERNAL_AI_WORKER_NAME}:${config.name}`,
			modules: [
				{
					type: "ESModule",
					path: "index.mjs",
					contents: EXTERNAL_AI_WORKER_SCRIPT,
				},
			],
			serviceBindings: {
				FETCHER: getAIFetcher({
					compliance_region: config.complianceRegion,
				}),
			},
		});

		wrappedBindings[bindings.ai.binding] = {
			scriptName: `${EXTERNAL_AI_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.ai && remoteBindingsEnabled) {
		warnOrError("ai", bindings.ai.experimental_remote, "always-remote");
	}

	if (bindings.browser && remoteBindingsEnabled) {
		warnOrError("browser", bindings.browser.experimental_remote, "remote");
	}

	if (bindings.mtls_certificates && remoteBindingsEnabled) {
		for (const mtls of bindings.mtls_certificates) {
			warnOrError(
				"mtls_certificates",
				mtls.experimental_remote,
				"always-remote"
			);
		}
	}

	// Uses the implementation in miniflare instead if the users enable local mode
	if (
		bindings.images?.binding &&
		!config.imagesLocalMode &&
		!remoteBindingsEnabled
	) {
		externalWorkers.push({
			name: `${EXTERNAL_IMAGES_WORKER_NAME}:${config.name}`,
			modules: [
				{
					type: "ESModule",
					path: "index.mjs",
					contents: EXTERNAL_IMAGES_WORKER_SCRIPT,
				},
			],
			serviceBindings: {
				FETCHER: getImagesRemoteFetcher({
					compliance_region: config.complianceRegion,
				}),
			},
		});

		wrappedBindings[bindings.images?.binding] = {
			scriptName: `${EXTERNAL_IMAGES_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.vectorize && !remoteBindingsEnabled) {
		for (const vectorizeBinding of bindings.vectorize) {
			const bindingName = vectorizeBinding.binding;
			const indexName = vectorizeBinding.index_name;
			const indexVersion = "v2";

			externalWorkers.push({
				name: `${EXTERNAL_VECTORIZE_WORKER_NAME}-${config.name}-${bindingName}`,
				modules: [
					{
						type: "ESModule",
						path: "index.mjs",
						contents: EXTERNAL_VECTORIZE_WORKER_SCRIPT,
					},
				],
				serviceBindings: {
					FETCHER: MakeVectorizeFetcher(
						{ compliance_region: config.complianceRegion },
						indexName
					),
				},
				bindings: {
					INDEX_ID: indexName,
					INDEX_VERSION: indexVersion,
				},
			});

			wrappedBindings[bindingName] = {
				scriptName: `${EXTERNAL_VECTORIZE_WORKER_NAME}-${config.name}-${bindingName}`,
			};
		}
	}

	const bindingOptions: WorkerOptionsBindings = {
		bindings: {
			...bindings.vars,
			// emulate version_metadata binding via a JSON var
			...(bindings.version_metadata
				? { [bindings.version_metadata.binding]: { id: randomUUID(), tag: "" } }
				: undefined),
		},
		textBlobBindings,
		dataBlobBindings,
		wasmBindings,

		ai:
			bindings.ai && remoteProxyConnectionString
				? {
						binding: bindings.ai.binding,
						remoteProxyConnectionString,
					}
				: undefined,

		kvNamespaces: Object.fromEntries(
			bindings.kv_namespaces?.map((kv) =>
				kvNamespaceEntry(kv, remoteProxyConnectionString)
			) ?? []
		),

		r2Buckets: Object.fromEntries(
			bindings.r2_buckets?.map((r2) =>
				r2BucketEntry(r2, remoteProxyConnectionString)
			) ?? []
		),
		d1Databases: Object.fromEntries(
			bindings.d1_databases?.map((d1) =>
				d1DatabaseEntry(d1, remoteProxyConnectionString)
			) ?? []
		),
		queueProducers: Object.fromEntries(
			bindings.queues?.map((queue) =>
				queueProducerEntry(queue, remoteProxyConnectionString)
			) ?? []
		),
		queueConsumers: Object.fromEntries(
			config.queueConsumers?.map(queueConsumerEntry) ?? []
		),
		pipelines: Object.fromEntries(
			bindings.pipelines?.map((pipeline) =>
				pipelineEntry(pipeline, remoteProxyConnectionString)
			) ?? []
		),
		hyperdrives: Object.fromEntries(
			bindings.hyperdrive?.map(hyperdriveEntry) ?? []
		),
		analyticsEngineDatasets: Object.fromEntries(
			bindings.analytics_engine_datasets?.map((binding) => [
				binding.binding,
				{ dataset: binding.dataset ?? "dataset" },
			]) ?? []
		),
		workflows: Object.fromEntries(
			bindings.workflows?.map((workflow) =>
				workflowEntry(workflow, remoteProxyConnectionString)
			) ?? []
		),
		secretsStoreSecrets: Object.fromEntries(
			bindings.secrets_store_secrets?.map((binding) => [
				binding.binding,
				binding,
			]) ?? []
		),
		helloWorld: Object.fromEntries(
			bindings.unsafe_hello_world?.map((binding) => [
				binding.binding,
				binding,
			]) ?? []
		),
		workerLoaders: Object.fromEntries(
			bindings.unsafe?.bindings
				?.filter((b) => b.type == "worker-loader")
				.map((binding) => [binding.name, {}]) ?? []
		),
		email: {
			send_email: bindings.send_email?.map((b) => ({
				...b,
				remoteProxyConnectionString:
					b.experimental_remote && remoteProxyConnectionString
						? remoteProxyConnectionString
						: undefined,
			})),
		},
		images:
			bindings.images && (config.imagesLocalMode || remoteBindingsEnabled)
				? {
						binding: bindings.images.binding,
						remoteProxyConnectionString:
							bindings.images.experimental_remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					}
				: undefined,
		browserRendering: bindings.browser?.binding
			? {
					binding: bindings.browser.binding,
					remoteProxyConnectionString:
						remoteBindingsEnabled &&
						remoteProxyConnectionString &&
						bindings.browser?.experimental_remote
							? remoteProxyConnectionString
							: undefined,
				}
			: undefined,

		vectorize:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.vectorize
							?.filter((v) => {
								warnOrError("vectorize", v.experimental_remote, "remote");
								return v.experimental_remote;
							})
							.map((vectorize) => {
								return [
									vectorize.binding,
									{
										index_name: vectorize.index_name,
										remoteProxyConnectionString,
									},
								];
							}) ?? []
					)
				: undefined,

		dispatchNamespaces:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.dispatch_namespaces
							?.filter((d) => {
								warnOrError(
									"dispatch_namespaces",
									d.experimental_remote,
									"remote"
								);
								return d.experimental_remote;
							})
							.map((dispatchNamespace) =>
								dispatchNamespaceEntry(
									dispatchNamespace,
									remoteProxyConnectionString
								)
							) ?? []
					)
				: undefined,

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

		ratelimits: Object.fromEntries(
			bindings.unsafe?.bindings
				?.filter((b) => b.type == "ratelimit")
				.map(ratelimitEntry) ?? []
		),

		mtlsCertificates:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.mtls_certificates
							?.filter((d) => {
								warnOrError(
									"mtls_certificates",
									d.experimental_remote,
									"remote"
								);
								return d.experimental_remote;
							})
							.map((mtlsCertificate) => [
								mtlsCertificate.binding,
								{
									remoteProxyConnectionString,
									certificate_id: mtlsCertificate.certificate_id,
								},
							]) ?? []
					)
				: undefined,

		serviceBindings,
		wrappedBindings: wrappedBindings,
		tails,
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

let didWarnMiniflareCronSupport = false;
let didWarnMiniflareVectorizeSupport = false;
let didWarnAiAccountUsage = false;

export type Options = Extract<MiniflareOptions, { workers: WorkerOptions[] }>;

export async function buildMiniflareOptions(
	log: Log,
	config: Omit<ConfigBundle, "rules">,
	proxyToUserWorkerAuthenticationSecret: UUID,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	remoteBindingsEnabled: boolean,
	onDevRegistryUpdate?: (registry: WorkerRegistry) => void
): Promise<Options> {
	if (config.crons?.length && !config.testScheduled) {
		if (!didWarnMiniflareCronSupport) {
			didWarnMiniflareCronSupport = true;
			logger.warn(
				"Miniflare does not currently trigger scheduled Workers automatically.\nRefer to https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers for more details "
			);
		}
	}

	if (!remoteBindingsEnabled) {
		if (config.bindings.ai) {
			if (!didWarnAiAccountUsage) {
				didWarnAiAccountUsage = true;
				logger.warn(
					"Using Workers AI always accesses your Cloudflare account in order to run AI models, and so will incur usage charges even in local development."
				);
			}
		}

		if (!config.bindVectorizeToProd && config.bindings.vectorize?.length) {
			logger.warn(
				"Vectorize local bindings are not supported yet. You may use the `--experimental-vectorize-bind-to-prod` flag to bind to your production index in local dev mode."
			);
			config.bindings.vectorize = [];
		}

		if (config.bindings.vectorize?.length) {
			if (!didWarnMiniflareVectorizeSupport) {
				didWarnMiniflareVectorizeSupport = true;
				logger.warn(
					"You are using Vectorize as a remote binding (through `--experimental-vectorize-bind-to-prod`). It may incur usage charges and modify your databases even in local development. "
				);
			}
		}
	}

	const upstream =
		typeof config.localUpstream === "string"
			? `${config.upstreamProtocol}://${config.localUpstream}`
			: undefined;

	const { sourceOptions, entrypointNames } = await buildSourceOptions(config);
	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		config,
		remoteProxyConnectionString,
		remoteBindingsEnabled
	);
	const sitesOptions = buildSitesOptions(config);
	const defaultPersistRoot = getDefaultPersistRoot(config.localPersistencePath);
	const assetOptions = buildAssetOptions(config);

	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		liveReload: config.liveReload,
		upstream,
		unsafeDevRegistryPath: config.devRegistry,
		unsafeDevRegistryDurableObjectProxy: true,
		unsafeHandleDevRegistryUpdate: onDevRegistryUpdate,
		unsafeProxySharedSecret: proxyToUserWorkerAuthenticationSecret,
		unsafeTriggerHandlers: true,
		// The way we run Miniflare instances with wrangler dev is that there are two:
		//  - one holding the proxy worker,
		//  - and one holding the user worker.
		// The issue with that setup is that end users would see two sets of request logs from Miniflare!
		// Instead of hiding all logs from this Miniflare instance, we specifically hide the request logs,
		// allowing other logs to be shown to the user (such as details about emails being triggered)
		logRequests: false,
		log,
		verbose: logger.loggerLevel === "debug",
		handleRuntimeStdio: handleRuntimeStdioWithStructuredLogs,
		structuredWorkerdLogs: true,
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
