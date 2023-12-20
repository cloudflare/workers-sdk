import assert from "node:assert";
import { realpathSync } from "node:fs";
import path from "node:path";
import { Log, LogLevel, TypedEventTarget, Mutex, Miniflare } from "miniflare";
import { ModuleTypeToRuleType } from "../deployment-bundle/module-collection";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { getHttpsOptions } from "../https-options";
import { logger } from "../logger";
import { updateCheck } from "../update-check";
import type { Config } from "../config";
import type {
	CfD1Database,
	CfDurableObject,
	CfHyperdrive,
	CfKvNamespace,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
} from "../deployment-bundle/worker";
import type { CfWorkerInit } from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { LoggerLevel } from "../logger";
import type { AssetPaths } from "../sites";
import type { EsbuildBundle } from "./use-esbuild";
import type {
	MiniflareOptions,
	SourceOptions,
	WorkerOptions,
	Request,
	Response,
} from "miniflare";
import type { Abortable } from "node:events";
import type { Readable } from "node:stream";

// This worker proxies all external Durable Objects to the Wrangler session
// where they're defined, and receives all requests from other Wrangler sessions
// for this session's Durable Objects. Note the original request URL may contain
// non-standard protocols, so we store it in a header to restore later.
const EXTERNAL_DURABLE_OBJECTS_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";
// noinspection HttpUrlsUsage
const EXTERNAL_DURABLE_OBJECTS_WORKER_SCRIPT = `
const HEADER_URL = "X-Miniflare-Durable-Object-URL";
const HEADER_NAME = "X-Miniflare-Durable-Object-Name";
const HEADER_ID = "X-Miniflare-Durable-Object-Id";

function createClass({ className, proxyUrl }) {
	return class {
		constructor(state) {
			this.id = state.id.toString();
		}
		fetch(request) {
			if (proxyUrl === undefined) {
				return new Response(\`[wrangler] Couldn't find \\\`wrangler dev\\\` session for class "\${className}" to proxy to\`, { status: 503 });
			}
			const proxyRequest = new Request(proxyUrl, request);
			proxyRequest.headers.set(HEADER_URL, request.url);
			proxyRequest.headers.set(HEADER_NAME, className);
			proxyRequest.headers.set(HEADER_ID, this.id);
			return fetch(proxyRequest);
		}
	}
}

export default {
	async fetch(request, env) {
		const originalUrl = request.headers.get(HEADER_URL);
		const className = request.headers.get(HEADER_NAME);
		const idString = request.headers.get(HEADER_ID);
		if (originalUrl === null || className === null || idString === null) {
			return new Response("[wrangler] Received Durable Object proxy request with missing headers", { status: 400 });
		}
		request = new Request(originalUrl, request);
		request.headers.delete(HEADER_URL);
		request.headers.delete(HEADER_NAME);
		request.headers.delete(HEADER_ID);
		const ns = env[className];
		const id = ns.idFromString(idString);
		const stub = ns.get(id);
		return stub.fetch(request);
	}
}
`;

type SpecificPort = Exclude<number, 0>;
type RandomConsistentPort = 0; // random port, but consistent across reloads
type RandomDifferentPort = undefined; // random port, but different across reloads
type Port = SpecificPort | RandomConsistentPort | RandomDifferentPort;

export interface ConfigBundle {
	// TODO(soon): maybe rename some of these options, check proposed API Google Docs
	name: string | undefined;
	bundle: EsbuildBundle;
	format: CfScriptFormat | undefined;
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined; // TODO: do we need this?
	bindings: CfWorkerInit["bindings"];
	workerDefinitions: WorkerRegistry | undefined;
	assetPaths: AssetPaths | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	localUpstream: string | undefined;
	inspect: boolean;
	serviceBindings: Record<string, (_request: Request) => Promise<Response>>;
}

export class WranglerLog extends Log {
	#warnedCompatibilityDateFallback = false;

	log(message: string) {
		// Hide request logs for external Durable Objects proxy worker
		if (message.includes(EXTERNAL_DURABLE_OBJECTS_WORKER_NAME)) return;
		super.log(message);
	}

	warn(message: string) {
		// Only log warning about requesting a compatibility date after the workerd
		// binary's version once, and only if there's an update available.
		if (message.startsWith("The latest compatibility date supported by")) {
			if (this.#warnedCompatibilityDateFallback) return;
			this.#warnedCompatibilityDateFallback = true;
			return void updateCheck().then((maybeNewVersion) => {
				if (maybeNewVersion === undefined) return;
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

export const DEFAULT_WORKER_NAME = "worker";
function getName(config: ConfigBundle) {
	return config.name ?? DEFAULT_WORKER_NAME;
}
const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
}

export function castLogLevel(level: LoggerLevel): LogLevel {
	let key = level.toUpperCase() as Uppercase<LoggerLevel>;
	if (key === "LOG") key = "INFO";

	return LogLevel[key];
}

function buildLog(): Log {
	let level = castLogLevel(logger.loggerLevel);

	// if we're in DEBUG or VERBOSE mode, clamp logLevel to WARN -- ie. don't show request logs for user worker
	if (level <= LogLevel.DEBUG) {
		level = Math.min(level, LogLevel.WARN);
	}

	return new WranglerLog(level, { prefix: "wrangler-UserWorker" });
}

async function buildSourceOptions(
	config: ConfigBundle
): Promise<SourceOptions> {
	const scriptPath = realpathSync(config.bundle.path);
	if (config.format === "modules") {
		const modulesRoot = path.dirname(scriptPath);
		const { entrypointSource, modules } = withSourceURLs(
			scriptPath,
			config.bundle.modules
		);
		return {
			modulesRoot,
			modules: [
				// Entrypoint
				{
					type: "ESModule",
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
	} else {
		// Miniflare will handle adding `//# sourceURL` comments if they're missing
		return { scriptPath };
	}
}

function kvNamespaceEntry({ binding, id }: CfKvNamespace): [string, string] {
	return [binding, id];
}
function r2BucketEntry({ binding, bucket_name }: CfR2Bucket): [string, string] {
	return [binding, bucket_name];
}
function d1DatabaseEntry(db: CfD1Database): [string, string] {
	return [db.binding, db.preview_database_id ?? db.database_id];
}
function queueProducerEntry(queue: CfQueue): [string, string] {
	return [queue.binding, queue.queue_name];
}
function hyperdriveEntry(hyperdrive: CfHyperdrive): [string, string] {
	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];
function queueConsumerEntry(consumer: QueueConsumer) {
	const options = {
		maxBatchSize: consumer.max_batch_size,
		maxBatchTimeout: consumer.max_batch_timeout,
		maxRetries: consumer.max_retries,
		deadLetterQueue: consumer.dead_letter_queue,
	};
	return [consumer.queue, options] as const;
}
// TODO(someday): would be nice to type these methods more, can we export types for
//  each plugin options schema and use those
function buildBindingOptions(config: ConfigBundle) {
	const bindings = config.bindings;

	// Setup blob and module bindings
	// TODO: check all these blob bindings just work, they're relative to cwd
	const textBlobBindings = { ...bindings.text_blobs };
	const dataBlobBindings = { ...bindings.data_blobs };
	const wasmBindings = { ...bindings.wasm_modules };
	if (config.format === "service-worker") {
		// For the service-worker format, blobs are accessible on the global scope
		const scriptPath = realpathSync(config.bundle.path);
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

	// Partition Durable Objects based on whether they're internal (defined by
	// this session's worker), or external (defined by another session's worker
	// registered in the dev registry)
	const internalObjects: CfDurableObject[] = [];
	const externalObjects: CfDurableObject[] = [];
	for (const binding of bindings.durable_objects?.bindings ?? []) {
		const internal =
			binding.script_name === undefined || binding.script_name === config.name;
		(internal ? internalObjects : externalObjects).push(binding);
	}
	// Setup Durable Object bindings and proxy worker
	const externalDurableObjectWorker: WorkerOptions = {
		name: EXTERNAL_DURABLE_OBJECTS_WORKER_NAME,
		// Bind all internal objects, so they're accessible by all other sessions
		// that proxy requests for our objects to this worker
		durableObjects: Object.fromEntries(
			internalObjects.map(({ class_name }) => [
				class_name,
				{ className: class_name, scriptName: getName(config) },
			])
		),
		// Use this worker instead of the user worker if the pathname is
		// `/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}`
		routes: [`*/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}`],
		// Use in-memory storage for the stub object classes *declared* by this
		// script. They don't need to persist anything, and would end up using the
		// incorrect unsafe unique key.
		unsafeEphemeralDurableObjects: true,
		modules: true,
		script:
			EXTERNAL_DURABLE_OBJECTS_WORKER_SCRIPT +
			// Add stub object classes that proxy requests to the correct session
			externalObjects
				.map(({ class_name, script_name }) => {
					assert(script_name !== undefined);
					const target = config.workerDefinitions?.[script_name];
					const targetHasClass = target?.durableObjects.some(
						({ className }) => className === class_name
					);

					const identifier = getIdentifier(`${script_name}_${class_name}`);
					const classNameJson = JSON.stringify(class_name);
					if (
						target?.host === undefined ||
						target.port === undefined ||
						!targetHasClass
					) {
						// If we couldn't find the target or the class, create a stub object
						// that just returns `503 Service Unavailable` responses.
						return `export const ${identifier} = createClass({ className: ${classNameJson} });`;
					} else {
						// Otherwise, create a stub object that proxies request to the
						// target session at `${hostname}:${port}`.
						const proxyUrl = `http://${target.host}:${target.port}/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}`;
						const proxyUrlJson = JSON.stringify(proxyUrl);
						return `export const ${identifier} = createClass({ className: ${classNameJson}, proxyUrl: ${proxyUrlJson} });`;
					}
				})
				.join("\n"),
	};

	const bindingOptions = {
		bindings: bindings.vars,
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
		hyperdrives: Object.fromEntries(
			bindings.hyperdrive?.map(hyperdriveEntry) ?? []
		),

		durableObjects: Object.fromEntries([
			...internalObjects.map(({ name, class_name }) => [name, class_name]),
			...externalObjects.map(({ name, class_name, script_name }) => {
				const identifier = getIdentifier(`${script_name}_${class_name}`);
				return [
					name,
					{
						className: identifier,
						scriptName: EXTERNAL_DURABLE_OBJECTS_WORKER_NAME,
						// Matches the unique key Miniflare will generate for this object in
						// the target session. We need to do this so workerd generates the
						// same IDs it would if this were part of the same process. workerd
						// doesn't allow IDs from Durable Objects with different unique keys
						// to be used with each other.
						unsafeUniqueKey: `${script_name}-${class_name}`,
					},
				];
			}),
		]),

		serviceBindings: config.serviceBindings,
		// TODO: check multi worker service bindings also supported
	};

	return {
		bindingOptions,
		internalObjects,
		externalDurableObjectWorker,
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
		};
	}
}

function buildSitesOptions({ assetPaths }: ConfigBundle) {
	if (assetPaths !== undefined) {
		const { baseDirectory, assetDirectory, includePatterns, excludePatterns } =
			assetPaths;
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
			// Matches stack traces from workerd
			//  - on unix: groups of 9 hex digits separated by spaces
			//  - on windows: groups of 12 hex digits, or a single digit 0, separated by spaces
			const containsHexStack = /stack:( (0|[a-f\d]{4,})){3,}/.test(chunk);

			return containsLlvmSymbolizerWarning || containsHexStack;
		},
		// Is this chunk an Address In Use error?
		isAddressInUse(chunk: string) {
			return chunk.includes("Address already in use; toString() = ");
		},
		isWarning(chunk: string) {
			return /\.c\+\+:\d+: warning:/.test(chunk);
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

		// anything not exlicitly handled above should be logged as info (via stdout)
		else {
			logger.info(chunk);
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

				// even though we've intercepted the chunk and logged a better error to stderr
				// fallthrough to log the original chunk to the debug log file for observability
			}

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			// so send it to the debug logs which are discarded unless
			// the user explicitly sets a logLevel indicating they care
			logger.debug(chunk);
		}

		// known case: warnings are not errors, log them as such
		else if (classifiers.isWarning(chunk)) {
			logger.warn(chunk);
		}

		// anything not exlicitly handled above should be logged as an error (via stderr)
		else {
			logger.error(chunk);
		}
	});
}

async function buildMiniflareOptions(
	log: Log,
	config: ConfigBundle
): Promise<{ options: MiniflareOptions; internalObjects: CfDurableObject[] }> {
	if (config.crons.length > 0) {
		logger.warn("Miniflare 3 does not support CRON triggers yet, ignoring...");
	}

	if (config.bindings.ai) {
		logger.warn(
			"Workers AI is not currently supported in local mode. Please use --remote to work with it."
		);
	}

	if (!config.bindings.ai && config.bindings.vectorize?.length) {
		// TODO: add local support for Vectorize bindings (https://github.com/cloudflare/workers-sdk/issues/4360)
		logger.warn(
			"Vectorize bindings are not currently supported in local mode. Please use --remote if you are working with them."
		);
	}

	const upstream =
		typeof config.localUpstream === "string"
			? `${config.localProtocol}://${config.localUpstream}`
			: undefined;

	const sourceOptions = await buildSourceOptions(config);
	const { bindingOptions, internalObjects, externalDurableObjectWorker } =
		buildBindingOptions(config);
	const sitesOptions = buildSitesOptions(config);
	const persistOptions = buildPersistOptions(config.localPersistencePath);

	let httpsOptions: { httpsKey: string; httpsCert: string } | undefined;
	if (config.localProtocol === "https") {
		const cert = await getHttpsOptions();
		httpsOptions = {
			httpsKey: cert.key,
			httpsCert: cert.cert,
		};
	}

	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		liveReload: config.liveReload,
		upstream,

		log,
		verbose: logger.loggerLevel === "debug",
		handleRuntimeStdio,

		...httpsOptions,
		...persistOptions,
		workers: [
			{
				name: getName(config),
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,

				...sourceOptions,
				...bindingOptions,
				...sitesOptions,
			},
			externalDurableObjectWorker,
		],
	};
	return { options, internalObjects };
}

export interface ReloadedEventOptions {
	url: URL;
	internalDurableObjects: CfDurableObject[];
}
export class ReloadedEvent extends Event implements ReloadedEventOptions {
	readonly url: URL;
	readonly internalDurableObjects: CfDurableObject[];

	constructor(type: "reloaded", options: ReloadedEventOptions) {
		super(type);
		this.url = options.url;
		this.internalDurableObjects = options.internalDurableObjects;
	}
}

export interface ErrorEventOptions {
	error: unknown;
}
export class ErrorEvent extends Event implements ErrorEventOptions {
	readonly error: unknown;

	constructor(type: "error", options: ErrorEventOptions) {
		super(type);
		this.error = options.error;
	}
}

export type MiniflareServerEventMap = {
	reloaded: ReloadedEvent;
	error: ErrorEvent;
};
export class MiniflareServer extends TypedEventTarget<MiniflareServerEventMap> {
	#log = buildLog();
	#mf?: Miniflare;

	// `buildMiniflareOptions()` is asynchronous, meaning if multiple bundle
	// updates were submitted, the second may apply before the first. Therefore,
	// wrap updates in a mutex, so they're always applied in invocation order.
	#mutex = new Mutex();

	async #onBundleUpdate(config: ConfigBundle, opts?: Abortable): Promise<void> {
		if (opts?.signal?.aborted) return;
		try {
			const { options, internalObjects } = await buildMiniflareOptions(
				this.#log,
				config
			);
			if (opts?.signal?.aborted) return;
			if (this.#mf === undefined) {
				this.#mf = new Miniflare(options);
			} else {
				await this.#mf.setOptions(options);
			}
			const url = await this.#mf.ready;
			if (opts?.signal?.aborted) return;
			const event = new ReloadedEvent("reloaded", {
				url,
				internalDurableObjects: internalObjects,
			});
			this.dispatchEvent(event);
		} catch (error: unknown) {
			this.dispatchEvent(new ErrorEvent("error", { error }));
		}
	}
	onBundleUpdate(config: ConfigBundle, opts?: Abortable): Promise<void> {
		return this.#mutex.runWith(() => this.#onBundleUpdate(config, opts));
	}

	#onDispose = async (): Promise<void> => {
		await this.#mf?.dispose();
		this.#mf = undefined;
	};
	onDispose(): Promise<void> {
		return this.#mutex.runWith(this.#onDispose);
	}
}
