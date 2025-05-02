import { randomUUID } from "node:crypto";
import path from "node:path";
import { Log, LogLevel } from "miniflare";
import {
	AIFetcher,
	EXTERNAL_AI_WORKER_NAME,
	EXTERNAL_AI_WORKER_SCRIPT,
} from "../ai/fetcher";
import { ModuleTypeToRuleType } from "../deployment-bundle/module-collection";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { getRegistryPath } from "../environment-variables/misc-variables";
import { createFatalError } from "../errors";
import {
	EXTERNAL_IMAGES_WORKER_NAME,
	EXTERNAL_IMAGES_WORKER_SCRIPT,
	imagesLocalFetcher,
	imagesRemoteFetcher,
} from "../images/fetcher";
import { logger } from "../logger";
import { getSourceMappedString } from "../sourcemap";
import { updateCheck } from "../update-check";
import {
	EXTERNAL_VECTORIZE_WORKER_NAME,
	EXTERNAL_VECTORIZE_WORKER_SCRIPT,
	MakeVectorizeFetcher,
} from "../vectorize/fetcher";
import { getClassNamesWhichUseSQLite } from "./class-names-sqlite";
import type { ServiceFetch } from "../api";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type {
	CfD1Database,
	CfDurableObject,
	CfHyperdrive,
	CfKvNamespace,
	CfPipeline,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfUnsafeBinding,
	CfWorkerInit,
	CfWorkflow,
} from "../deployment-bundle/worker";
import type { LoggerLevel } from "../logger";
import type { LegacyAssetPaths } from "../sites";
import type { EsbuildBundle } from "./use-esbuild";
import type { MiniflareOptions, SourceOptions, WorkerOptions } from "miniflare";
import type { UUID } from "node:crypto";
import type { Readable } from "node:stream";

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
	bindings: CfWorkerInit["bindings"];
	migrations: Config["migrations"] | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
	localPersistencePath: string | null;
	liveReload: boolean;
	devRegistry: boolean;
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

function kvNamespaceEntry({ binding, id }: CfKvNamespace): [string, string] {
	return [binding, getRemoteId(id) ?? binding];
}
function r2BucketEntry({ binding, bucket_name }: CfR2Bucket): [string, string] {
	return [binding, getRemoteId(bucket_name) ?? binding];
}
function d1DatabaseEntry(db: CfD1Database): [string, string] {
	return [
		db.binding,
		getRemoteId(db.preview_database_id ?? db.database_id) ?? db.binding,
	];
}
function queueProducerEntry(
	queue: CfQueue
): [string, { queueName: string; deliveryDelay: number | undefined }] {
	return [
		queue.binding,
		{ queueName: queue.queue_name, deliveryDelay: queue.delivery_delay },
	];
}
function pipelineEntry(pipeline: CfPipeline): [string, string] {
	return [pipeline.binding, pipeline.pipeline];
}
function hyperdriveEntry(hyperdrive: CfHyperdrive): [string, string] {
	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
function workflowEntry(
	workflow: CfWorkflow
): [string, { name: string; className: string; scriptName?: string }] {
	return [
		workflow.binding,
		{
			name: workflow.name,
			className: workflow.class_name,
			scriptName: workflow.script_name,
		},
	];
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
	| "email"
	| "analyticsEngineDatasets"
	| "tails"
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
> &
	Partial<Pick<ConfigBundle, "format" | "bundle" | "assets">>;

// TODO(someday): would be nice to type these methods more, can we export types for
//  each plugin options schema and use those
export function buildMiniflareBindingOptions(config: MiniflareBindingsConfig): {
	bindingOptions: WorkerOptionsBindings;
	internalObjects: CfDurableObject[];
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

	// Partition Durable Objects based on whether they're internal (defined by
	// this session's worker), or external (defined by another session's worker
	// registered in the dev registry)
	const internalObjects: CfDurableObject[] = [];
	const externalObjects: CfDurableObject[] = [];
	const externalWorkers: WorkerOptions[] = [];
	for (const binding of bindings.durable_objects?.bindings ?? []) {
		const internal =
			binding.script_name === undefined || binding.script_name === config.name;
		(internal ? internalObjects : externalObjects).push(binding);
	}

	const wrappedBindings: WorkerOptions["wrappedBindings"] = {};
	if (bindings.ai?.binding) {
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
				FETCHER: AIFetcher,
			},
		});

		wrappedBindings[bindings.ai.binding] = {
			scriptName: `${EXTERNAL_AI_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.images?.binding) {
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
				FETCHER: config.imagesLocalMode
					? imagesLocalFetcher
					: imagesRemoteFetcher,
			},
		});

		wrappedBindings[bindings.images?.binding] = {
			scriptName: `${EXTERNAL_IMAGES_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.vectorize) {
		for (const vectorizeBinding of bindings.vectorize) {
			const bindingName = vectorizeBinding.binding;
			const indexName = vectorizeBinding.index_name;
			const indexVersion = "v2";

			externalWorkers.push({
				name: `${EXTERNAL_VECTORIZE_WORKER_NAME}:${config.name}:${bindingName}`,
				modules: [
					{
						type: "ESModule",
						path: "index.mjs",
						contents: EXTERNAL_VECTORIZE_WORKER_SCRIPT,
					},
				],
				serviceBindings: {
					FETCHER: MakeVectorizeFetcher(indexName),
				},
				bindings: {
					INDEX_ID: indexName,
					INDEX_VERSION: indexVersion,
				},
			});

			wrappedBindings[bindingName] = {
				scriptName: `${EXTERNAL_VECTORIZE_WORKER_NAME}:${config.name}:${bindingName}`,
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

		kvNamespaces: Object.fromEntries(
			bindings.kv_namespaces?.map(kvNamespaceEntry) ?? []
		),
		r2Buckets: Object.fromEntries(
			bindings.r2_buckets?.map(r2BucketEntry) ?? []
		),
		d1Databases: Object.fromEntries(
			bindings.d1_databases?.map(d1DatabaseEntry) ?? []
		),
		queueProducers: Object.fromEntries(
			bindings.queues?.map(queueProducerEntry) ?? []
		),
		queueConsumers: Object.fromEntries(
			config.queueConsumers?.map(queueConsumerEntry) ?? []
		),
		pipelines: Object.fromEntries(bindings.pipelines?.map(pipelineEntry) ?? []),
		hyperdrives: Object.fromEntries(
			bindings.hyperdrive?.map(hyperdriveEntry) ?? []
		),
		analyticsEngineDatasets: Object.fromEntries(
			bindings.analytics_engine_datasets?.map((binding) => [
				binding.binding,
				{ dataset: binding.dataset ?? "dataset" },
			]) ?? []
		),
		workflows: Object.fromEntries(bindings.workflows?.map(workflowEntry) ?? []),
		secretsStoreSecrets: Object.fromEntries(
			bindings.secrets_store_secrets?.map((binding) => [
				binding.binding,
				binding,
			]) ?? []
		),
		email: {
			send_email: bindings.send_email,
		},

		durableObjects: Object.fromEntries([
			...internalObjects.map(({ name, class_name }) => {
				const useSQLite = classNameToUseSQLite.get(class_name);
				return [
					name,
					{
						className: class_name,
						useSQLite,
					},
				];
			}),
			...externalObjects.map(({ name, class_name, script_name }) => {
				return [
					name,
					{
						className: class_name,
						scriptName: script_name,
						// Why is "useSQLite" not included before?
						useSQLite: classNameToUseSQLite.get(class_name),
					},
				];
			}),
		]),

		ratelimits: Object.fromEntries(
			bindings.unsafe?.bindings
				?.filter((b) => b.type == "ratelimit")
				.map(ratelimitEntry) ?? []
		),

		serviceBindings,
		wrappedBindings: wrappedBindings,
		tails,
	};

	return {
		bindingOptions,
		internalObjects,
		externalWorkers,
	};
}

type PickTemplate<T, K extends string> = {
	[P in keyof T & K]: T[P];
};
type PersistOptions = PickTemplate<MiniflareOptions, `${string}Persist`>;
export function buildPersistOptions(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): PersistOptions | undefined {
	if (localPersistencePath !== null) {
		const v3Path = path.join(localPersistencePath, "v3");
		return {
			cachePersist: path.join(v3Path, "cache"),
			durableObjectsPersist: path.join(v3Path, "do"),
			kvPersist: path.join(v3Path, "kv"),
			r2Persist: path.join(v3Path, "r2"),
			d1Persist: path.join(v3Path, "d1"),
			workflowsPersist: path.join(v3Path, "workflows"),
			secretsStorePersist: path.join(v3Path, "secrets-store"),
			analyticsEngineDatasetsPersist: path.join(v3Path, "analytics-engine"),
		};
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

export function handleRuntimeStdio(stdout: Readable, stderr: Readable) {
	// ASSUMPTION: each chunk is a whole message from workerd
	// This may not hold across OSes/architectures, but it seems to work on macOS M-line
	// I'm going with this simple approach to avoid complicating this too early
	// We can iterate on this heuristic in the future if it causes issues
	const classifiers = {
		// Is this chunk a big chonky barf from workerd that we want to hijack to cleanup/ignore?
		isBarf(chunk: string) {
			const containsLlvmSymbolizerWarning = chunk.includes(
				"Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set"
			);
			const containsRecursiveIsolateLockWarning = chunk.includes(
				"took recursive isolate lock"
			);
			// Matches stack traces from workerd
			//  - on unix: groups of 9 hex digits separated by spaces
			//  - on windows: groups of 12 hex digits, or a single digit 0, separated by spaces
			const containsHexStack = /stack:( (0|[a-f\d]{4,})){3,}/.test(chunk);

			return (
				containsLlvmSymbolizerWarning ||
				containsRecursiveIsolateLockWarning ||
				containsHexStack
			);
		},
		// Is this chunk an Address In Use error?
		isAddressInUse(chunk: string) {
			return chunk.includes("Address already in use; toString() = ");
		},
		isWarning(chunk: string) {
			return /\.c\+\+:\d+: warning:/.test(chunk);
		},
		isCodeMovedWarning(chunk: string) {
			return /CODE_MOVED for unknown code block/.test(chunk);
		},
		isAccessViolation(chunk: string) {
			return chunk.includes("access violation;");
		},
	};

	stdout.on("data", (chunk: Buffer | string) => {
		chunk = chunk.toString().trim();

		if (classifiers.isBarf(chunk)) {
			// this is a big chonky barf from workerd that we want to hijack to cleanup/ignore

			// CLEANABLE:
			// there are no known cases to cleanup yet
			// but, as they are identified, we will do that here

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			// so send it to the debug logs which are discarded unless
			// the user explicitly sets a logLevel indicating they care
			logger.debug(chunk);
		}

		// known case: warnings are not info, log them as such
		else if (classifiers.isWarning(chunk)) {
			logger.warn(chunk);
		}

		// anything not explicitly handled above should be logged as info (via stdout)
		else {
			logger.info(getSourceMappedString(chunk));
		}
	});

	stderr.on("data", (chunk: Buffer | string) => {
		chunk = chunk.toString().trim();

		if (classifiers.isBarf(chunk)) {
			// this is a big chonky barf from workerd that we want to hijack to cleanup/ignore

			// CLEANABLE:
			// known case to cleanup: Address in use errors
			if (classifiers.isAddressInUse(chunk)) {
				const address = chunk.match(
					/Address already in use; toString\(\) = (.+)\n/
				)?.[1];

				logger.error(
					`Address already in use (${address}). Please check that you are not already running a server on this address or specify a different port with --port.`
				);

				// Log the original error to the debug logs.
				logger.debug(chunk);
			}
			// In the past we have seen Access Violation errors on Windows, which may be caused by an outdated
			// version of the Windows OS or the Microsoft Visual C++ Redistributable.
			// See https://github.com/cloudflare/workers-sdk/issues/6170#issuecomment-2245209918
			else if (classifiers.isAccessViolation(chunk)) {
				let error = "There was an access violation in the runtime.";
				if (process.platform === "win32") {
					error +=
						"\nOn Windows, this may be caused by an outdated Microsoft Visual C++ Redistributable library.\n" +
						"Check that you have the latest version installed.\n" +
						"See https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist.";
				}
				logger.error(error);

				// Log the original error to the debug logs.
				logger.debug(chunk);
			}

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			// so send it to the debug logs which are discarded unless
			// the user explicitly sets a logLevel indicating they care
			else {
				logger.debug(chunk);
			}
		}

		// known case: warnings are not errors, log them as such
		else if (classifiers.isWarning(chunk)) {
			logger.warn(chunk);
		}

		// known case: "error: CODE_MOVED for unknown code block?", warning for workerd devs, not application devs
		else if (classifiers.isCodeMovedWarning(chunk)) {
			// ignore entirely, don't even send it to the debug log file
		}

		// anything not explicitly handled above should be logged as an error (via stderr)
		else {
			logger.error(getSourceMappedString(chunk));
		}
	});
}

let didWarnMiniflareCronSupport = false;
let didWarnMiniflareVectorizeSupport = false;
let didWarnAiAccountUsage = false;
let didWarnImagesLocalModeUsage = false;

export type Options = Extract<MiniflareOptions, { workers: WorkerOptions[] }>;

export async function buildMiniflareOptions(
	log: Log,
	config: Omit<ConfigBundle, "rules">,
	proxyToUserWorkerAuthenticationSecret: UUID
): Promise<{
	options: Options;
	internalObjects: CfDurableObject[];
	entrypointNames: string[];
}> {
	if (config.crons.length > 0 && !config.testScheduled) {
		if (!didWarnMiniflareCronSupport) {
			didWarnMiniflareCronSupport = true;
			logger.warn(
				"Miniflare does not currently trigger scheduled Workers automatically.\nRefer to https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers for more details "
			);
		}
	}

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
				"You are using a mixed-mode binding for Vectorize (through `--experimental-vectorize-bind-to-prod`). It may incur usage charges and modify your databases even in local development. "
			);
		}
	}

	if (config.bindings.images && config.imagesLocalMode) {
		if (!didWarnImagesLocalModeUsage) {
			try {
				await import("sharp");
			} catch {
				const msg =
					"Sharp must be installed to use the Images binding local mode; check your version of Node is compatible";
				throw createFatalError(msg, false);
			}

			didWarnImagesLocalModeUsage = true;
			logger.info(
				"You are using Images local mode. This only supports resizing, rotating and transcoding."
			);
		}
	}

	const upstream =
		typeof config.localUpstream === "string"
			? `${config.upstreamProtocol}://${config.localUpstream}`
			: undefined;

	const { sourceOptions, entrypointNames } = await buildSourceOptions(config);
	const { bindingOptions, internalObjects, externalWorkers } =
		buildMiniflareBindingOptions(config);
	const sitesOptions = buildSitesOptions(config);
	const persistOptions = buildPersistOptions(config.localPersistencePath);
	const assetOptions = buildAssetOptions(config);
	const registryPath = getRegistryPath();
	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		liveReload: config.liveReload,
		upstream,
		unsafeDevRegistryPath: config.devRegistry ? registryPath : undefined,
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
		handleRuntimeStdio,

		...persistOptions,
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
			},
			...externalWorkers,
		],
	};
	return { options, internalObjects, entrypointNames };
}
