import assert from "assert";
import crypto from "crypto";
import { Abortable } from "events";
import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { Duplex, Transform, Writable } from "stream";
import { ReadableStream } from "stream/web";
import util from "util";
import zlib from "zlib";
import exitHook from "exit-hook";
import { $ as colors$ } from "kleur/colors";
import stoppable from "stoppable";
import {
	Dispatcher,
	getGlobalDispatcher,
	Pool,
	Response as UndiciResponse,
} from "undici";
import SCRIPT_MINIFLARE_SHARED from "worker:shared/index";
import SCRIPT_MINIFLARE_ZOD from "worker:shared/zod";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { fallbackCf, setupCf } from "./cf";
import {
	coupleWebSocket,
	DispatchFetch,
	DispatchFetchDispatcher,
	ENTRY_SOCKET_HTTP_OPTIONS,
	fetch,
	getAccessibleHosts,
	getEntrySocketHttpOptions,
	Headers,
	Request,
	RequestInit,
	Response,
} from "./http";
import {
	D1_PLUGIN_NAME,
	DURABLE_OBJECTS_PLUGIN_NAME,
	DurableObjectClassNames,
	getDirectSocketName,
	getGlobalServices,
	HOST_CAPNP_CONNECT,
	KV_PLUGIN_NAME,
	normaliseDurableObject,
	PLUGIN_ENTRIES,
	Plugins,
	PluginServicesOptions,
	ProxyClient,
	ProxyNodeBinding,
	QueueConsumers,
	QueueProducers,
	QUEUES_PLUGIN_NAME,
	QueuesError,
	R2_PLUGIN_NAME,
	ReplaceWorkersTypes,
	SERVICE_ENTRY,
	SharedOptions,
	SOCKET_ENTRY,
	SOCKET_ENTRY_LOCAL,
	WorkerOptions,
	WrappedBindingNames,
} from "./plugins";
import { ROUTER_SERVICE_NAME } from "./plugins/assets/constants";
import {
	CUSTOM_SERVICE_KNOWN_OUTBOUND,
	CustomServiceKind,
	getUserServiceName,
	handlePrettyErrorRequest,
	JsonErrorSchema,
	maybeWrappedModuleToWorkerName,
	NameSourceOptions,
	reviveError,
	ServiceDesignatorSchema,
} from "./plugins/core";
import {
	Config,
	Extension,
	HttpOptions_Style,
	kInspectorSocket,
	Runtime,
	RuntimeOptions,
	serializeConfig,
	Service,
	Socket,
	SocketIdentifier,
	SocketPorts,
	Worker_Binding,
	Worker_Module,
} from "./runtime";
import {
	_isCyclic,
	Log,
	MiniflareCoreError,
	NoOpLog,
	OptionalZodTypeOf,
	parseWithRootPath,
	stripAnsi,
} from "./shared";
import { isCompressedByCloudflareFL } from "./shared/mime-types";
import {
	CoreBindings,
	CoreHeaders,
	LogLevel,
	Mutex,
	SharedHeaders,
	SiteBindings,
} from "./workers";
import { formatZodError } from "./zod-format";
import type {
	CacheStorage,
	D1Database,
	DurableObjectNamespace,
	Fetcher,
	KVNamespace,
	Queue,
	R2Bucket,
} from "@cloudflare/workers-types/experimental";

const DEFAULT_HOST = "127.0.0.1";
function getURLSafeHost(host: string) {
	return net.isIPv6(host) ? `[${host}]` : host;
}
function maybeGetLocallyAccessibleHost(
	h: string
): "localhost" | "127.0.0.1" | "[::1]" | undefined {
	if (h === "localhost") return "localhost";
	if (h === "127.0.0.1" || h === "*" || h === "0.0.0.0" || h === "::") {
		return "127.0.0.1";
	}
	if (h === "::1") return "[::1]";
}

function getServerPort(server: http.Server) {
	const address = server.address();
	// Note address would be string with unix socket
	assert(address !== null && typeof address === "object");
	return address.port;
}

// ===== `Miniflare` User Options =====
export type MiniflareOptions = SharedOptions &
	(WorkerOptions | { workers: WorkerOptions[] });

// ===== `Miniflare` Validated Options =====
type PluginWorkerOptions = {
	[Key in keyof Plugins]: z.infer<Plugins[Key]["options"]>;
};
type PluginSharedOptions = {
	[Key in keyof Plugins]: OptionalZodTypeOf<Plugins[Key]["sharedOptions"]>;
};

function hasMultipleWorkers(opts: unknown): opts is { workers: unknown[] } {
	return (
		typeof opts === "object" &&
		opts !== null &&
		"workers" in opts &&
		Array.isArray(opts.workers)
	);
}
export function getRootPath(opts: unknown): string {
	// `opts` will be validated properly with Zod, this is just a quick check/
	// extract for the `rootPath` option since it's required for parsing
	if (
		typeof opts === "object" &&
		opts !== null &&
		"rootPath" in opts &&
		typeof opts.rootPath === "string"
	) {
		return opts.rootPath;
	} else {
		return ""; // Default to cwd
	}
}

function validateOptions(
	opts: unknown
): [PluginSharedOptions, PluginWorkerOptions[]] {
	// Normalise options into shared and worker-specific
	const sharedOpts = opts;
	const multipleWorkers = hasMultipleWorkers(opts);
	const workerOpts = multipleWorkers ? opts.workers : [opts];
	if (workerOpts.length === 0) {
		throw new MiniflareCoreError("ERR_NO_WORKERS", "No workers defined");
	}

	// Initialise return values
	const pluginSharedOpts = {} as PluginSharedOptions;
	const pluginWorkerOpts = Array.from(Array(workerOpts.length)).map(
		() => ({}) as PluginWorkerOptions
	);

	// If we haven't defined multiple workers, shared options and worker options
	// are the same, but we only want to resolve the `rootPath` once. Otherwise,
	// if specified a relative `rootPath` (e.g. "./dir"), we end up with a root
	// path of `$PWD/dir/dir` when resolving other options.
	const sharedRootPath = multipleWorkers ? getRootPath(sharedOpts) : "";
	const workerRootPaths = workerOpts.map((opts) =>
		path.resolve(sharedRootPath, getRootPath(opts))
	);

	// Validate all options
	try {
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			// @ts-expect-error types of individual plugin options are unknown
			pluginSharedOpts[key] =
				plugin.sharedOptions === undefined
					? undefined
					: parseWithRootPath(sharedRootPath, plugin.sharedOptions, sharedOpts);
			for (let i = 0; i < workerOpts.length; i++) {
				// Make sure paths are correct in validation errors
				const optionsPath = multipleWorkers ? ["workers", i] : undefined;
				// @ts-expect-error types of individual plugin options are unknown
				pluginWorkerOpts[i][key] = parseWithRootPath(
					workerRootPaths[i],
					plugin.options,
					workerOpts[i],
					{ path: optionsPath }
				);
			}
		}
	} catch (e) {
		if (e instanceof z.ZodError) {
			let formatted: string | undefined;
			try {
				formatted = formatZodError(e, opts);
			} catch (formatError) {
				// If formatting failed for some reason, we'd like to know, so log a
				// bunch of debugging information, including the full validation error
				// so users at least know what was wrong.

				const title = "[Miniflare] Validation Error Format Failure";
				const message = [
					"### Input",
					"```",
					util.inspect(opts, { depth: null }),
					"```",
					"",
					"### Validation Error",
					"```",
					e.stack,
					"```",
					"",
					"### Format Error",
					"```",
					typeof formatError === "object" &&
					formatError !== null &&
					"stack" in formatError &&
					typeof formatError.stack === "string"
						? formatError.stack
						: String(formatError),
					"```",
				].join("\n");
				const githubIssueUrl = new URL(
					"https://github.com/cloudflare/miniflare/issues/new"
				);
				githubIssueUrl.searchParams.set("title", title);
				githubIssueUrl.searchParams.set("body", message);

				formatted = [
					"Unable to format validation error.",
					"Please open the following URL in your browser to create a GitHub issue:",
					githubIssueUrl,
					"",
					message,
					"",
				].join("\n");
			}
			const error = new MiniflareCoreError(
				"ERR_VALIDATION",
				`Unexpected options passed to \`new Miniflare()\` constructor:\n${formatted}`
			);
			// Add the `cause` as a getter, so it isn't logged automatically with the
			// error, but can still be accessed if needed
			Object.defineProperty(error, "cause", { get: () => e });
			throw error;
		}
		throw e;
	}

	// Validate names unique
	const names = new Set<string>();
	for (const opts of pluginWorkerOpts) {
		const name = opts.core.name ?? "";
		if (names.has(name)) {
			throw new MiniflareCoreError(
				"ERR_DUPLICATE_NAME",
				name === ""
					? "Multiple workers defined without a `name`"
					: `Multiple workers defined with the same \`name\`: "${name}"`
			);
		}
		names.add(name);
	}

	return [pluginSharedOpts, pluginWorkerOpts];
}

// When creating user worker services, we need to know which Durable Objects
// they export. Rather than parsing JavaScript to search for class exports
// (which would have to be recursive because of `export * from ...`), we collect
// all Durable Object bindings, noting that bindings may be defined for objects
// in other services.
function getDurableObjectClassNames(
	allWorkerOpts: PluginWorkerOptions[]
): DurableObjectClassNames {
	const serviceClassNames: DurableObjectClassNames = new Map();
	for (const workerOpts of allWorkerOpts) {
		const workerServiceName = getUserServiceName(workerOpts.core.name);
		for (const designator of Object.values(
			workerOpts.do.durableObjects ?? {}
		)) {
			const {
				className,
				// Fallback to current worker service if name not defined
				serviceName = workerServiceName,
				enableSql,
				unsafeUniqueKey,
				unsafePreventEviction,
			} = normaliseDurableObject(designator);
			// Get or create `Map` mapping class name to optional unsafe unique key
			let classNames = serviceClassNames.get(serviceName);
			if (classNames === undefined) {
				classNames = new Map();
				serviceClassNames.set(serviceName, classNames);
			}
			if (classNames.has(className)) {
				// If we've already seen this class in this service, make sure the
				// unsafe unique keys and unsafe prevent eviction values match
				const existingInfo = classNames.get(className);
				if (existingInfo?.enableSql !== enableSql) {
					throw new MiniflareCoreError(
						"ERR_DIFFERENT_STORAGE_BACKEND",
						`Different storage backends defined for Durable Object "${className}" in "${serviceName}": ${JSON.stringify(
							enableSql
						)} and ${JSON.stringify(existingInfo?.enableSql)}`
					);
				}
				if (existingInfo?.unsafeUniqueKey !== unsafeUniqueKey) {
					throw new MiniflareCoreError(
						"ERR_DIFFERENT_UNIQUE_KEYS",
						`Multiple unsafe unique keys defined for Durable Object "${className}" in "${serviceName}": ${JSON.stringify(
							unsafeUniqueKey
						)} and ${JSON.stringify(existingInfo?.unsafeUniqueKey)}`
					);
				}
				if (existingInfo?.unsafePreventEviction !== unsafePreventEviction) {
					throw new MiniflareCoreError(
						"ERR_DIFFERENT_PREVENT_EVICTION",
						`Multiple unsafe prevent eviction values defined for Durable Object "${className}" in "${serviceName}": ${JSON.stringify(
							unsafePreventEviction
						)} and ${JSON.stringify(existingInfo?.unsafePreventEviction)}`
					);
				}
			} else {
				// Otherwise, just add it
				classNames.set(className, {
					enableSql,
					unsafeUniqueKey,
					unsafePreventEviction,
				});
			}
		}
	}
	return serviceClassNames;
}

function invalidWrappedAsBound(name: string, bindingType: string): never {
	const stringName = JSON.stringify(name);
	throw new MiniflareCoreError(
		"ERR_INVALID_WRAPPED",
		`Cannot use ${stringName} for wrapped binding because it is bound to with ${bindingType} bindings.\nEnsure other workers don't define ${bindingType} bindings to ${stringName}.`
	);
}
function getWrappedBindingNames(
	allWorkerOpts: PluginWorkerOptions[],
	durableObjectClassNames: DurableObjectClassNames
): WrappedBindingNames {
	// Build set of all worker names bound to as wrapped bindings.
	// Also check these "workers" aren't bound to as services/Durable Objects.
	// We won't add them as regular workers so these bindings would fail.
	const wrappedBindingWorkerNames = new Set<string>();
	for (const workerOpts of allWorkerOpts) {
		for (const designator of Object.values(
			workerOpts.core.wrappedBindings ?? {}
		)) {
			const scriptName =
				typeof designator === "object" ? designator.scriptName : designator;
			if (durableObjectClassNames.has(getUserServiceName(scriptName))) {
				invalidWrappedAsBound(scriptName, "Durable Object");
			}
			wrappedBindingWorkerNames.add(scriptName);
		}
	}
	// Need to collect all wrapped bindings before checking service bindings
	for (const workerOpts of allWorkerOpts) {
		for (const designator of Object.values(
			workerOpts.core.serviceBindings ?? {}
		)) {
			if (typeof designator !== "string") continue;
			if (wrappedBindingWorkerNames.has(designator)) {
				invalidWrappedAsBound(designator, "service");
			}
		}
	}
	return wrappedBindingWorkerNames;
}

function getQueueProducers(
	allWorkerOpts: PluginWorkerOptions[]
): QueueProducers {
	const queueProducers: QueueProducers = new Map();
	for (const workerOpts of allWorkerOpts) {
		const workerName = workerOpts.core.name ?? "";
		let workerProducers = workerOpts.queues.queueProducers;

		if (workerProducers !== undefined) {
			// De-sugar array consumer options to record mapping to empty options
			if (Array.isArray(workerProducers)) {
				// queueProducers: ["MY_QUEUE"]
				workerProducers = Object.fromEntries(
					workerProducers.map((bindingName) => [
						bindingName,
						{ queueName: bindingName },
					])
				);
			}

			type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][];
			type ProducersIterable = Entries<typeof workerProducers>;
			const producersIterable = Object.entries(
				workerProducers
			) as ProducersIterable;

			for (const [bindingName, opts] of producersIterable) {
				if (typeof opts === "string") {
					// queueProducers: { "MY_QUEUE": "my-queue" }
					queueProducers.set(bindingName, { workerName, queueName: opts });
				} else {
					// queueProducers: { QUEUE: { queueName: "QUEUE", ... } }
					queueProducers.set(bindingName, { workerName, ...opts });
				}
			}
		}
	}
	return queueProducers;
}

function getQueueConsumers(
	allWorkerOpts: PluginWorkerOptions[]
): QueueConsumers {
	const queueConsumers: QueueConsumers = new Map();
	for (const workerOpts of allWorkerOpts) {
		const workerName = workerOpts.core.name ?? "";
		let workerConsumers = workerOpts.queues.queueConsumers;
		if (workerConsumers !== undefined) {
			// De-sugar array consumer options to record mapping to empty options
			if (Array.isArray(workerConsumers)) {
				workerConsumers = Object.fromEntries(
					workerConsumers.map((queueName) => [queueName, {}])
				);
			}

			for (const [queueName, opts] of Object.entries(workerConsumers)) {
				// Validate that each queue has at most one consumer...
				const existingConsumer = queueConsumers.get(queueName);
				if (existingConsumer !== undefined) {
					throw new QueuesError(
						"ERR_MULTIPLE_CONSUMERS",
						`Multiple consumers defined for queue "${queueName}": "${existingConsumer.workerName}" and "${workerName}"`
					);
				}
				// ...then store the consumer
				queueConsumers.set(queueName, { workerName, ...opts });
			}
		}
	}

	for (const [queueName, consumer] of queueConsumers) {
		// Check the dead letter queue isn't configured to be the queue itself
		// (NOTE: Queues *does* permit DLQ cycles between multiple queues,
		//  i.e. if Q2 is DLQ for Q1, but Q1 is DLQ for Q2)
		if (consumer.deadLetterQueue === queueName) {
			throw new QueuesError(
				"ERR_DEAD_LETTER_QUEUE_CYCLE",
				`Dead letter queue for queue "${queueName}" cannot be itself`
			);
		}
	}

	return queueConsumers;
}

// Collects all routes from all worker services
function getWorkerRoutes(
	allWorkerOpts: PluginWorkerOptions[],
	wrappedBindingNames: Set<string>
): Map<string, string[]> {
	const allRoutes = new Map<string, string[]>();
	for (const workerOpts of allWorkerOpts) {
		const name = workerOpts.core.name ?? "";
		if (wrappedBindingNames.has(name)) continue; // Wrapped bindings un-routable
		assert(!allRoutes.has(name)); // Validated unique names earlier
		allRoutes.set(name, workerOpts.core.routes ?? []);
	}
	return allRoutes;
}

// Get the name of a binding in the `ProxyServer`'s `env`
function getProxyBindingName(plugin: string, worker: string, binding: string) {
	return [
		CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY,
		plugin,
		worker,
		binding,
	].join(":");
}
// Get whether a binding will need a proxy to be supported in Node (i.e. is
// the implementation of this binding in `workerd`?). If this returns `false`,
// there's no need to bind the binding to the `ProxyServer`.
function isNativeTargetBinding(binding: Worker_Binding) {
	return !(
		"json" in binding ||
		"wasmModule" in binding ||
		"text" in binding ||
		"data" in binding
	);
}
// Converts a regular worker binding to binding suitable for the `ProxyServer`.
function buildProxyBinding(
	plugin: string,
	worker: string,
	binding: Worker_Binding
): Worker_Binding {
	assert(binding.name !== undefined);
	const name = getProxyBindingName(plugin, worker, binding.name);
	const proxyBinding = { ...binding, name };
	// If this is a Durable Object namespace binding to the current worker,
	// make sure it continues to point to that worker when bound elsewhere
	if (
		"durableObjectNamespace" in proxyBinding &&
		proxyBinding.durableObjectNamespace !== undefined
	) {
		proxyBinding.durableObjectNamespace.serviceName ??=
			getUserServiceName(worker);
	}
	return proxyBinding;
}
// Gets an array of proxy bindings for internal Durable Objects, only used in
// testing for accessing internal methods
function getInternalDurableObjectProxyBindings(
	plugin: string,
	service: Service
): Worker_Binding[] | undefined {
	if (!("worker" in service)) return;
	assert(service.worker !== undefined);
	const serviceName = service.name;
	assert(serviceName !== undefined);
	return service.worker.durableObjectNamespaces?.map(({ className }) => {
		assert(className !== undefined);
		return {
			name: getProxyBindingName(`${plugin}-internal`, serviceName, className),
			durableObjectNamespace: { serviceName, className },
		};
	});
}

type StoppableServer = http.Server & stoppable.WithStop;

const restrictedUndiciHeaders = [
	// From Miniflare 2:
	// https://github.com/cloudflare/miniflare/blob/9c135599dc21fe69080ada17fce6153692793bf1/packages/core/src/standards/http.ts#L129-L132
	"transfer-encoding",
	"connection",
	"keep-alive",
	"expect",
];
const restrictedWebSocketUpgradeHeaders = [
	"upgrade",
	"connection",
	"sec-websocket-accept",
];

export function _transformsForContentEncodingAndContentType(
	encoding: string | undefined,
	type: string | undefined | null
): Transform[] {
	const encoders: Transform[] = [];
	if (!encoding) return encoders;
	// if cloudflare's FL does not compress this mime-type, then don't compress locally either
	if (!isCompressedByCloudflareFL(type)) return encoders;

	// Reverse of https://github.com/nodejs/undici/blob/48d9578f431cbbd6e74f77455ba92184f57096cf/lib/fetch/index.js#L1660
	const codings = encoding
		.toLowerCase()
		.split(",")
		.map((x) => x.trim());
	for (const coding of codings) {
		if (/(x-)?gzip/.test(coding)) {
			encoders.push(zlib.createGzip());
		} else if (/(x-)?deflate/.test(coding)) {
			encoders.push(zlib.createDeflate());
		} else if (coding === "br") {
			encoders.push(zlib.createBrotliCompress());
		} else {
			// Unknown encoding, don't do any encoding at all
			encoders.length = 0;
			break;
		}
	}
	return encoders;
}

async function writeResponse(response: Response, res: http.ServerResponse) {
	// Convert headers into Node-friendly format
	const headers: http.OutgoingHttpHeaders = {};
	for (const entry of response.headers) {
		const key = entry[0].toLowerCase();
		const value = entry[1];
		if (key === "set-cookie") {
			headers[key] = response.headers.getSetCookie();
		} else {
			headers[key] = value;
		}
	}

	// If a `Content-Encoding` header is set, we'll need to encode the body
	// (likely only set by custom service bindings)
	const encoding = headers["content-encoding"]?.toString();
	const type = headers["content-type"]?.toString();
	const encoders = _transformsForContentEncodingAndContentType(encoding, type);
	if (encoders.length > 0) {
		// `Content-Length` if set, will be wrong as it's for the decoded length
		delete headers["content-length"];
	}

	res.writeHead(response.status, response.statusText, headers);

	// `initialStream` is the stream we'll write the response to. It
	// should end up as the first encoder, piping to the next encoder,
	// and finally piping to the response:
	//
	// encoders[0] (initialStream) -> encoders[1] -> res
	//
	// Not using `pipeline(passThrough, ...encoders, res)` here as that
	// gives a premature close error with server sent events. This also
	// avoids creating an extra stream even when we're not encoding.
	let initialStream: Writable = res;
	for (let i = encoders.length - 1; i >= 0; i--) {
		encoders[i].pipe(initialStream);
		initialStream = encoders[i];
	}

	// Response body may be null if empty
	if (response.body) {
		for await (const chunk of response.body) {
			if (chunk) initialStream.write(chunk);
		}
	}

	initialStream.end();
}

function safeReadableStreamFrom(iterable: AsyncIterable<Uint8Array>) {
	// Adapted from `undici`, catches errors from `next()` to avoid unhandled
	// rejections from aborted request body streams:
	// https://github.com/nodejs/undici/blob/dfaec78f7a29f07bb043f9006ed0ceb0d5220b55/lib/core/util.js#L369-L392
	let iterator: AsyncIterator<Uint8Array>;
	return new ReadableStream<Uint8Array>({
		async start() {
			iterator = iterable[Symbol.asyncIterator]();
		},
		// @ts-expect-error `pull` may return anything
		async pull(controller): Promise<boolean> {
			try {
				const { done, value } = await iterator.next();
				if (done) {
					queueMicrotask(() => controller.close());
				} else {
					const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
					controller.enqueue(new Uint8Array(buf));
				}
			} catch {
				queueMicrotask(() => controller.close());
			}
			// @ts-expect-error `pull` may return anything
			return controller.desiredSize > 0;
		},
		async cancel() {
			await iterator.return?.();
		},
	});
}

// Maps `Miniflare` instances to stack traces for their construction. Used to identify un-`dispose()`d instances.
let maybeInstanceRegistry:
	| Map<Miniflare, string /* constructionStack */>
	| undefined;
/** @internal */
export function _initialiseInstanceRegistry() {
	return (maybeInstanceRegistry = new Map());
}

export class Miniflare {
	#previousSharedOpts?: PluginSharedOptions;
	#previousWorkerOpts?: PluginWorkerOptions[];
	#sharedOpts: PluginSharedOptions;
	#workerOpts: PluginWorkerOptions[];
	#log: Log;

	readonly #runtime?: Runtime;
	readonly #removeExitHook?: () => void;
	#runtimeEntryURL?: URL;
	#socketPorts?: SocketPorts;
	#runtimeDispatcher?: Dispatcher;
	#proxyClient?: ProxyClient;

	#cfObject?: Record<string, any> = {};

	// Path to temporary directory for use as scratch space/"in-memory" Durable
	// Object storage. Note this may not exist, it's up to the consumers to
	// create this if needed. Deleted on `dispose()`.
	readonly #tmpPath: string;

	// Mutual exclusion lock for runtime operations (i.e. initialisation and
	// updating config). This essentially puts initialisation and future updates
	// in a queue, ensuring they're performed in calling order.
	readonly #runtimeMutex: Mutex;

	// Store `#init()` `Promise`, so we can propagate initialisation errors in
	// `ready`. We would have no way of catching these otherwise.
	readonly #initPromise: Promise<void>;

	// Aborted when dispose() is called
	readonly #disposeController: AbortController;
	#loopbackServer?: StoppableServer;
	#loopbackHost?: string;
	readonly #liveReloadServer: WebSocketServer;
	readonly #webSocketServer: WebSocketServer;
	readonly #webSocketExtraHeaders: WeakMap<http.IncomingMessage, Headers>;

	constructor(opts: MiniflareOptions) {
		// Split and validate options
		const [sharedOpts, workerOpts] = validateOptions(opts);
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;

		// Add to registry after initial options validation, before any servers/
		// child processes are started
		if (maybeInstanceRegistry !== undefined) {
			const object = { name: "Miniflare", stack: "" };
			Error.captureStackTrace(object, Miniflare);
			maybeInstanceRegistry.set(this, object.stack);
		}

		this.#log = this.#sharedOpts.core.log ?? new NoOpLog();

		this.#liveReloadServer = new WebSocketServer({ noServer: true });
		this.#webSocketServer = new WebSocketServer({
			noServer: true,
			// Disable automatic handling of `Sec-WebSocket-Protocol` header,
			// Cloudflare Workers require users to include this header themselves in
			// `Response`s: https://github.com/cloudflare/miniflare/issues/179
			handleProtocols: () => false,
		});
		// Add custom headers included in response to WebSocket upgrade requests
		this.#webSocketExtraHeaders = new WeakMap();
		this.#webSocketServer.on("headers", (headers, req) => {
			const extra = this.#webSocketExtraHeaders.get(req);
			this.#webSocketExtraHeaders.delete(req);
			if (extra) {
				for (const [key, value] of extra) {
					if (!restrictedWebSocketUpgradeHeaders.includes(key.toLowerCase())) {
						headers.push(`${key}: ${value}`);
					}
				}
			}
		});

		// Build path for temporary directory. We don't actually want to create this
		// unless it's needed (i.e. we have Durable Objects enabled). This means we
		// can't use `fs.mkdtemp()`, as that always creates the directory.
		this.#tmpPath = path.join(
			os.tmpdir(),
			`miniflare-${crypto.randomBytes(16).toString("hex")}`
		);

		// Setup runtime
		this.#runtime = new Runtime();
		this.#removeExitHook = exitHook(() => {
			void this.#runtime?.dispose();
			try {
				fs.rmSync(this.#tmpPath, { force: true, recursive: true });
			} catch (e) {
				// `rmSync` may fail on Windows with `EBUSY` if `workerd` is still
				// running. `Runtime#dispose()` should kill the runtime immediately.
				// `exitHook`s must be synchronous, so we can only clean up on a best
				// effort basis.
				this.#log.debug(`Unable to remove temporary directory: ${String(e)}`);
			}
		});

		this.#disposeController = new AbortController();
		this.#runtimeMutex = new Mutex();
		this.#initPromise = this.#runtimeMutex
			.runWith(() => this.#assembleAndUpdateConfig())
			.catch((e) => {
				// If initialisation failed, attempting to `dispose()` this instance
				// will too. Therefore, remove from the instance registry now, so we
				// can still test async initialisation failures, without test failures
				// telling us to `dispose()` the instance.
				maybeInstanceRegistry?.delete(this);
				throw e;
			});
	}

	#handleReload() {
		// Reload all connected live reload clients
		for (const ws of this.#liveReloadServer.clients) {
			ws.close(1012, "Service Restart");
		}
		// Close all existing web sockets on reload
		for (const ws of this.#webSocketServer.clients) {
			ws.close(1012, "Service Restart");
		}
	}

	async #handleLoopbackCustomService(
		request: Request,
		customService: string
	): Promise<Response> {
		const slashIndex = customService.indexOf("/");
		// TODO: technically may want to keep old versions around so can always
		//  recover this in case of setOptions()?
		const workerIndex = parseInt(customService.substring(0, slashIndex));
		const serviceKind = customService[slashIndex + 1] as CustomServiceKind;
		const serviceName = customService.substring(slashIndex + 2);
		let service: z.infer<typeof ServiceDesignatorSchema> | undefined;
		if (serviceKind === CustomServiceKind.UNKNOWN) {
			service =
				this.#workerOpts[workerIndex]?.core.serviceBindings?.[serviceName];
		} else if (serviceName === CUSTOM_SERVICE_KNOWN_OUTBOUND) {
			service = this.#workerOpts[workerIndex]?.core.outboundService;
		}
		// Should only define custom service bindings if `service` is a function
		assert(typeof service === "function");
		try {
			let response: UndiciResponse | Response = await service(request, this);

			if (!(response instanceof Response)) {
				response = new Response(response.body, response);
			}

			// Validate return type as `service` is a user defined function
			// TODO: should we validate outside this try/catch?
			return z.instanceof(Response).parse(response);
		} catch (e: any) {
			// TODO: do we need to add `CF-Exception` header or something here?
			//  check what runtime does
			return new Response(e?.stack ?? e, { status: 500 });
		}
	}

	get #workerSrcOpts(): NameSourceOptions[] {
		return this.#workerOpts.map<NameSourceOptions>(({ core }) => core);
	}

	#handleLoopback = async (
		req: http.IncomingMessage,
		res?: http.ServerResponse
	): Promise<Response | undefined> => {
		// Extract headers from request
		const headers = new Headers();
		for (const [name, values] of Object.entries(req.headers)) {
			// These headers are unsupported in undici fetch requests, they're added
			// automatically. For custom service bindings, we may pass this request
			// straight through to another fetch so strip them now.
			if (restrictedUndiciHeaders.includes(name)) continue;
			if (Array.isArray(values)) {
				for (const value of values) headers.append(name, value);
			} else if (values !== undefined) {
				headers.append(name, values);
			}
		}

		// Extract cf blob (if any) from headers
		const cfBlob = headers.get(CoreHeaders.CF_BLOB);
		headers.delete(CoreHeaders.CF_BLOB);
		assert(!Array.isArray(cfBlob)); // Only `Set-Cookie` headers are arrays
		const cf = cfBlob ? JSON.parse(cfBlob) : undefined;

		// Extract original URL passed to `fetch`
		const originalUrl = headers.get(CoreHeaders.ORIGINAL_URL);
		const url = new URL(originalUrl ?? req.url ?? "", "http://localhost");
		headers.delete(CoreHeaders.ORIGINAL_URL);

		const noBody = req.method === "GET" || req.method === "HEAD";
		const body = noBody ? undefined : safeReadableStreamFrom(req);
		const request = new Request(url, {
			method: req.method,
			headers,
			body,
			duplex: "half",
			cf,
		});

		let response: Response | undefined;
		try {
			const customService = request.headers.get(CoreHeaders.CUSTOM_SERVICE);
			if (customService !== null) {
				request.headers.delete(CoreHeaders.CUSTOM_SERVICE);
				response = await this.#handleLoopbackCustomService(
					request,
					customService
				);
			} else if (
				this.#sharedOpts.core.unsafeModuleFallbackService !== undefined &&
				request.headers.has("X-Resolve-Method") &&
				originalUrl === null
			) {
				response = await this.#sharedOpts.core.unsafeModuleFallbackService(
					request,
					this
				);
			} else if (url.pathname === "/core/error") {
				response = await handlePrettyErrorRequest(
					this.#log,
					this.#workerSrcOpts,
					request
				);
			} else if (url.pathname === "/core/log") {
				// Safety of `!`: `parseInt(null)` is `NaN`
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const level = parseInt(request.headers.get(SharedHeaders.LOG_LEVEL)!);
				assert(
					LogLevel.NONE <= level && level <= LogLevel.VERBOSE,
					`Expected ${SharedHeaders.LOG_LEVEL} header to be log level, got ${level}`
				);
				const logLevel = level as LogLevel;
				let message = await request.text();
				if (!colors$.enabled) message = stripAnsi(message);
				this.#log.logWithLevel(logLevel, message);
				response = new Response(null, { status: 204 });
			}
		} catch (e: any) {
			this.#log.error(e);
			res?.writeHead(500);
			res?.end(e?.stack ?? String(e));
			return;
		}

		if (res !== undefined) {
			if (response === undefined) {
				res.writeHead(404);
				res.end();
			} else {
				await writeResponse(response, res);
			}
		}

		return response;
	};

	#handleLoopbackUpgrade = async (
		req: http.IncomingMessage,
		socket: Duplex,
		head: Buffer
	) => {
		// Only interested in pathname so base URL doesn't matter
		const { pathname } = new URL(req.url ?? "", "http://localhost");

		// If this is the path for live-reload, handle the request
		if (pathname === "/cdn-cgi/mf/reload") {
			this.#liveReloadServer.handleUpgrade(req, socket, head, (ws) => {
				this.#liveReloadServer.emit("connection", ws, req);
			});
			return;
		}

		// Otherwise, try handle the request in a worker
		const response = await this.#handleLoopback(req);

		// Check web socket response was returned
		const webSocket = response?.webSocket;
		if (response?.status === 101 && webSocket) {
			// Accept and couple the Web Socket
			this.#webSocketExtraHeaders.set(req, response.headers);
			this.#webSocketServer.handleUpgrade(req, socket, head, (ws) => {
				void coupleWebSocket(ws, webSocket);
				this.#webSocketServer.emit("connection", ws, req);
			});
			return;
		}

		// Otherwise, we'll be returning a regular HTTP response
		const res = new http.ServerResponse(req);
		// `socket` is guaranteed to be an instance of `net.Socket`:
		// https://nodejs.org/api/http.html#event-upgrade_1
		assert(socket instanceof net.Socket);
		res.assignSocket(socket);

		// If no response was provided, or it was an "ok" response, log an error
		if (!response || response.ok) {
			res.writeHead(500);
			res.end();
			this.#log.error(
				new TypeError(
					"Web Socket request did not return status 101 Switching Protocols response with Web Socket"
				)
			);
			return;
		}

		// Otherwise, send the response as is (e.g. unauthorised)
		await writeResponse(response, res);
	};

	async #getLoopbackPort(): Promise<number> {
		// This function must be run with `#runtimeMutex` held

		// Start loopback server (how the runtime accesses Node.js) using the same
		// host as the main runtime server. This means we can use the loopback
		// server for live reload updates too.
		const loopbackHost = this.#sharedOpts.core.host ?? DEFAULT_HOST;
		// If we've already started the loopback server...
		if (this.#loopbackServer !== undefined) {
			// ...and it's using the correct host, reuse it
			if (this.#loopbackHost === loopbackHost) {
				return getServerPort(this.#loopbackServer);
			}
			// Otherwise, stop it, and create a new one
			await this.#stopLoopbackServer();
		}
		this.#loopbackServer = await this.#startLoopbackServer(loopbackHost);
		this.#loopbackHost = loopbackHost;
		return getServerPort(this.#loopbackServer);
	}

	#startLoopbackServer(hostname: string): Promise<StoppableServer> {
		if (hostname === "*") hostname = "::";

		return new Promise((resolve) => {
			const server = stoppable(
				http.createServer(this.#handleLoopback),
				/* grace */ 0
			);
			server.on("upgrade", this.#handleLoopbackUpgrade);
			server.listen(0, hostname, () => resolve(server));
		});
	}

	#stopLoopbackServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			assert(this.#loopbackServer !== undefined);
			this.#loopbackServer.stop((err) => (err ? reject(err) : resolve()));
		});
	}

	#getSocketAddress(
		id: SocketIdentifier,
		previousRequestedPort: number | undefined,
		host = DEFAULT_HOST,
		requestedPort?: number
	) {
		// If `port` is set to `0`, was previously set to `0`, and we previously had
		// a port for this socket, reuse that random port
		if (requestedPort === 0 && previousRequestedPort === 0) {
			requestedPort = this.#socketPorts?.get(id);
		}
		// Otherwise, default to a new random port
		return `${getURLSafeHost(host)}:${requestedPort ?? 0}`;
	}

	async #assembleConfig(loopbackPort: number): Promise<Config> {
		const allPreviousWorkerOpts = this.#previousWorkerOpts;
		const allWorkerOpts = this.#workerOpts;
		const sharedOpts = this.#sharedOpts;

		sharedOpts.core.cf = await setupCf(this.#log, sharedOpts.core.cf);
		this.#cfObject = sharedOpts.core.cf;

		const durableObjectClassNames = getDurableObjectClassNames(allWorkerOpts);
		const wrappedBindingNames = getWrappedBindingNames(
			allWorkerOpts,
			durableObjectClassNames
		);
		const queueProducers = getQueueProducers(allWorkerOpts);
		const queueConsumers = getQueueConsumers(allWorkerOpts);
		const allWorkerRoutes = getWorkerRoutes(allWorkerOpts, wrappedBindingNames);
		const workerNames = [...allWorkerRoutes.keys()];

		// Use Map to dedupe services by name
		const services = new Map<string, Service>();
		const extensions: Extension[] = [
			{
				modules: [
					{ name: "miniflare:shared", esModule: SCRIPT_MINIFLARE_SHARED() },
					{ name: "miniflare:zod", esModule: SCRIPT_MINIFLARE_ZOD() },
				],
			},
		];

		const sockets: Socket[] = [
			{
				name: SOCKET_ENTRY,
				service: { name: SERVICE_ENTRY },
				...(await getEntrySocketHttpOptions(sharedOpts.core)),
			},
		];
		const configuredHost = sharedOpts.core.host ?? DEFAULT_HOST;
		if (maybeGetLocallyAccessibleHost(configuredHost) === undefined) {
			// If we aren't able to locally access `workerd` on the configured host, configure an additional socket that's
			// only accessible on `127.0.0.1:0`
			sockets.push({
				name: SOCKET_ENTRY_LOCAL,
				service: { name: SERVICE_ENTRY },
				http: ENTRY_SOCKET_HTTP_OPTIONS,
				address: "127.0.0.1:0",
			});
		}

		// Bindings for `ProxyServer` Durable Object
		const proxyBindings: Worker_Binding[] = [];

		const allWorkerBindings = new Map<string, Worker_Binding[]>();
		const wrappedBindingsToPopulate: {
			workerName: string;
			innerBindings: Worker_Binding[];
		}[] = [];

		for (let i = 0; i < allWorkerOpts.length; i++) {
			const previousWorkerOpts = allPreviousWorkerOpts?.[i];
			const workerOpts = allWorkerOpts[i];
			const workerName = workerOpts.core.name ?? "";
			const isModulesWorker = Boolean(workerOpts.core.modules);

			if (workerOpts.workflows.workflows) {
				for (const workflow of Object.values(workerOpts.workflows.workflows)) {
					// This will be the UserWorker, or the vitest pool worker wrapping the UserWorker
					// The workflows plugin needs this so that it can set the binding between the Engine and the UserWorker
					workflow.scriptName ??= workerOpts.core.name;
				}
			}

			if (workerOpts.assets.assets) {
				// This will be the UserWorker, or the vitest pool worker wrapping the UserWorker
				// The asset plugin needs this so that it can set the binding between the RouterWorker and the UserWorker
				// TODO: apply this to ever this.#workerOpts, not just the first (i.e this.#workerOpts[0])
				workerOpts.assets.assets.workerName = workerOpts.core.name;
			}

			// Collect all bindings from this worker
			const workerBindings: Worker_Binding[] = [];
			allWorkerBindings.set(workerName, workerBindings);
			const additionalModules: Worker_Module[] = [];
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				// @ts-expect-error `CoreOptionsSchema` has required options which are
				//  missing in other plugins' options.
				const pluginBindings = await plugin.getBindings(workerOpts[key], i);
				if (pluginBindings !== undefined) {
					for (const binding of pluginBindings) {
						// If this is the Workers Sites manifest, we need to add it as a
						// module for modules workers. For all other bindings, and in
						// service workers, just add to worker bindings.
						if (
							key === "kv" &&
							binding.name === SiteBindings.JSON_SITE_MANIFEST &&
							isModulesWorker
						) {
							assert("json" in binding && binding.json !== undefined);
							additionalModules.push({
								name: SiteBindings.JSON_SITE_MANIFEST,
								text: binding.json,
							});
						} else {
							workerBindings.push(binding);
						}

						// Only `workerd` native bindings need to be proxied, the rest are
						// already supported by Node.js (e.g. json, text/data blob, wasm)
						if (isNativeTargetBinding(binding)) {
							proxyBindings.push(buildProxyBinding(key, workerName, binding));
						}
						// If this is a wrapped binding to a wrapped binding worker, record
						// it, so we can populate its inner bindings with all the wrapped
						// binding worker's bindings.
						if (
							"wrapped" in binding &&
							binding.wrapped?.moduleName !== undefined &&
							binding.wrapped.innerBindings !== undefined
						) {
							const workerName = maybeWrappedModuleToWorkerName(
								binding.wrapped.moduleName
							);
							if (workerName !== undefined) {
								wrappedBindingsToPopulate.push({
									workerName,
									innerBindings: binding.wrapped.innerBindings,
								});
							}
						}
					}
				}
			}

			// Collect all services required by this worker
			const unsafeStickyBlobs = sharedOpts.core.unsafeStickyBlobs ?? false;
			const unsafeEphemeralDurableObjects =
				workerOpts.core.unsafeEphemeralDurableObjects ?? false;
			const pluginServicesOptionsBase: Omit<
				PluginServicesOptions<z.ZodTypeAny, undefined>,
				"options" | "sharedOptions"
			> = {
				log: this.#log,
				workerBindings,
				workerIndex: i,
				additionalModules,
				tmpPath: this.#tmpPath,
				workerNames,
				loopbackPort,
				unsafeStickyBlobs,
				wrappedBindingNames,
				durableObjectClassNames,
				unsafeEphemeralDurableObjects,
				queueProducers,
				queueConsumers,
			};
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginServicesExtensions = await plugin.getServices({
					...pluginServicesOptionsBase,
					// @ts-expect-error `CoreOptionsSchema` has required options which are
					//  missing in other plugins' options.
					options: workerOpts[key],
					// @ts-expect-error `QueuesPlugin` doesn't define shared options
					sharedOptions: sharedOpts[key],
				});
				if (pluginServicesExtensions !== undefined) {
					let pluginServices: Service[];
					if (Array.isArray(pluginServicesExtensions)) {
						pluginServices = pluginServicesExtensions;
					} else {
						pluginServices = pluginServicesExtensions.services;
						extensions.push(...pluginServicesExtensions.extensions);
					}

					for (const service of pluginServices) {
						if (service.name !== undefined && !services.has(service.name)) {
							services.set(service.name, service);
							if (key !== DURABLE_OBJECTS_PLUGIN_NAME) {
								const maybeBindings = getInternalDurableObjectProxyBindings(
									key,
									service
								);
								if (maybeBindings !== undefined) {
									proxyBindings.push(...maybeBindings);
								}
							}
						}
					}
				}
			}

			// Allow additional sockets to be opened directly to specific workers,
			// bypassing Miniflare's entry worker.
			const previousDirectSockets =
				previousWorkerOpts?.core.unsafeDirectSockets ?? [];
			const directSockets = workerOpts.core.unsafeDirectSockets ?? [];
			for (let j = 0; j < directSockets.length; j++) {
				const previousDirectSocket = previousDirectSockets[j];
				const directSocket = directSockets[j];
				const entrypoint = directSocket.entrypoint ?? "default";
				const name = getDirectSocketName(i, entrypoint);
				const address = this.#getSocketAddress(
					name,
					previousDirectSocket?.port,
					directSocket.host,
					directSocket.port
				);
				sockets.push({
					name,
					address,
					service: {
						name: workerOpts.assets.assets
							? `${ROUTER_SERVICE_NAME}-${workerName}`
							: getUserServiceName(workerName),
						entrypoint: entrypoint === "default" ? undefined : entrypoint,
					},
					http: {
						style: directSocket.proxy ? HttpOptions_Style.PROXY : undefined,
						cfBlobHeader: CoreHeaders.CF_BLOB,
						capnpConnectHost: HOST_CAPNP_CONNECT,
					},
				});
			}
		}

		const globalServices = getGlobalServices({
			sharedOptions: sharedOpts.core,
			allWorkerRoutes,
			// if Workers + Assets project but NOT Vitest, point to router Worker instead
			// if Vitest with assets, the self binding on the test runner will point to RW
			fallbackWorkerName:
				this.#workerOpts[0].assets.assets &&
				!this.#workerOpts[0].core.name?.startsWith(
					"vitest-pool-workers-runner-"
				)
					? `${ROUTER_SERVICE_NAME}-${this.#workerOpts[0].core.name}`
					: getUserServiceName(this.#workerOpts[0].core.name),
			loopbackPort,
			log: this.#log,
			proxyBindings,
		});
		for (const service of globalServices) {
			// Global services should all have unique names
			assert(service.name !== undefined && !services.has(service.name));
			services.set(service.name, service);
		}

		// Populate wrapped binding inner bindings with bound worker's bindings
		for (const toPopulate of wrappedBindingsToPopulate) {
			const bindings = allWorkerBindings.get(toPopulate.workerName);
			if (bindings === undefined) continue;
			const existingBindingNames = new Set(
				toPopulate.innerBindings.map(({ name }) => name)
			);
			toPopulate.innerBindings.push(
				// If there's already an inner binding with this name, don't add again
				...bindings.filter(({ name }) => !existingBindingNames.has(name))
			);
		}
		// If we populated wrapped bindings, we may have created cycles in the
		// `services` array. Attempting to serialise these will lead to unbounded
		// recursion, so make sure we don't have any
		const servicesArray = Array.from(services.values());
		if (wrappedBindingsToPopulate.length > 0 && _isCyclic(servicesArray)) {
			throw new MiniflareCoreError(
				"ERR_CYCLIC",
				"Generated workerd config contains cycles. " +
					"Ensure wrapped bindings don't have bindings to themselves."
			);
		}

		return { services: servicesArray, sockets, extensions };
	}

	async #assembleAndUpdateConfig() {
		// This function must be run with `#runtimeMutex` held
		const initial = !this.#runtimeEntryURL;
		assert(this.#runtime !== undefined);
		const loopbackPort = await this.#getLoopbackPort();
		const config = await this.#assembleConfig(loopbackPort);
		const configBuffer = serializeConfig(config);

		// Get all socket names we expect to get ports for
		assert(config.sockets !== undefined);
		const requiredSockets: SocketIdentifier[] = config.sockets.map(
			({ name }) => {
				assert(name !== undefined);
				return name;
			}
		);
		if (this.#sharedOpts.core.inspectorPort !== undefined) {
			requiredSockets.push(kInspectorSocket);
		}

		// Reload runtime
		const configuredHost = this.#sharedOpts.core.host ?? DEFAULT_HOST;
		const entryAddress = this.#getSocketAddress(
			SOCKET_ENTRY,
			this.#previousSharedOpts?.core.port,
			configuredHost,
			this.#sharedOpts.core.port
		);
		let inspectorAddress: string | undefined;
		if (this.#sharedOpts.core.inspectorPort !== undefined) {
			inspectorAddress = this.#getSocketAddress(
				kInspectorSocket,
				this.#previousSharedOpts?.core.inspectorPort,
				"localhost",
				this.#sharedOpts.core.inspectorPort
			);
		}
		const loopbackAddress = `${
			maybeGetLocallyAccessibleHost(configuredHost) ??
			getURLSafeHost(configuredHost)
		}:${loopbackPort}`;
		const runtimeOpts: Abortable & RuntimeOptions = {
			signal: this.#disposeController.signal,
			entryAddress,
			loopbackAddress,
			requiredSockets,
			inspectorAddress,
			verbose: this.#sharedOpts.core.verbose,
			handleRuntimeStdio: this.#sharedOpts.core.handleRuntimeStdio,
		};
		const maybeSocketPorts = await this.#runtime.updateConfig(
			configBuffer,
			runtimeOpts
		);
		if (this.#disposeController.signal.aborted) return;
		if (maybeSocketPorts === undefined) {
			throw new MiniflareCoreError(
				"ERR_RUNTIME_FAILURE",
				"The Workers runtime failed to start. " +
					"There is likely additional logging output above."
			);
		}
		// Note: `updateConfig()` doesn't resolve until ports for all required
		// sockets have been recorded. At this point, `maybeSocketPorts` contains
		// all of `requiredSockets` as keys.
		this.#socketPorts = maybeSocketPorts;

		const entrySocket = config.sockets?.[0];
		const secure = entrySocket !== undefined && "https" in entrySocket;
		const previousEntryURL = this.#runtimeEntryURL;

		const entryPort = maybeSocketPorts.get(SOCKET_ENTRY);
		assert(entryPort !== undefined);

		const maybeAccessibleHost = maybeGetLocallyAccessibleHost(configuredHost);
		if (maybeAccessibleHost === undefined) {
			// If the configured host wasn't locally accessible, we should've configured a 2nd local entry socket that is
			const localEntryPort = maybeSocketPorts.get(SOCKET_ENTRY_LOCAL);
			assert(localEntryPort !== undefined, "Expected local entry socket port");
			this.#runtimeEntryURL = new URL(`http://127.0.0.1:${localEntryPort}`);
		} else {
			this.#runtimeEntryURL = new URL(
				`${secure ? "https" : "http"}://${maybeAccessibleHost}:${entryPort}`
			);
		}

		if (previousEntryURL?.toString() !== this.#runtimeEntryURL.toString()) {
			this.#runtimeDispatcher = new Pool(this.#runtimeEntryURL, {
				connect: { rejectUnauthorized: false },
			});
		}
		if (this.#proxyClient === undefined) {
			this.#proxyClient = new ProxyClient(
				this.#runtimeEntryURL,
				this.dispatchFetch
			);
		} else {
			// Update the proxy client with the new runtime URL to send requests to.
			// Existing proxies will already have been poisoned in `setOptions()`.
			this.#proxyClient.setRuntimeEntryURL(this.#runtimeEntryURL);
		}

		if (!this.#runtimeMutex.hasWaiting) {
			// Only log and trigger reload if there aren't pending updates
			const ready = initial ? "Ready" : "Updated and ready";

			const urlSafeHost = getURLSafeHost(configuredHost);
			this.#log.info(
				`${ready} on ${secure ? "https" : "http"}://${urlSafeHost}:${entryPort}`
			);

			if (initial) {
				const hosts: string[] = [];
				if (configuredHost === "::" || configuredHost === "*") {
					hosts.push("localhost");
					hosts.push("[::1]");
				}
				if (
					configuredHost === "::" ||
					configuredHost === "*" ||
					configuredHost === "0.0.0.0"
				) {
					hosts.push(...getAccessibleHosts(true));
				}

				for (const h of hosts) {
					this.#log.info(`- ${secure ? "https" : "http"}://${h}:${entryPort}`);
				}
			}

			this.#handleReload();
		}
	}

	async #waitForReady(disposing = false) {
		// If `#init()` threw, we'd like to propagate the error here, so `await` it.
		// Note we can't use `async`/`await` with getters. We'd also like to wait
		// for `setOptions` calls to complete before resolving.
		await this.#initPromise;
		// We'd also like to wait for `setOptions` calls to complete before, so wait
		// for runtime mutex to drain (i.e. all options updates applied).
		// (NOTE: can't just repeatedly wait on the mutex as use the presence of
		// waiters on the mutex to avoid logging ready/updated messages to the
		// console if there are future updates)
		await this.#runtimeMutex.drained();
		// If we called `dispose()`, we may not have a `#runtimeEntryURL` if we
		// `dispose()`d synchronously, immediately after constructing a `Miniflare`
		// instance. In this case, return a discard URL which we'll ignore.
		if (disposing) return new URL("http://[100::]/");
		// Make sure `dispose()` wasn't called in the time we've been waiting
		this.#checkDisposed();
		// `#runtimeEntryURL` is assigned in `#assembleAndUpdateConfig()`, which is
		// called by `#init()`, and `#initPromise` doesn't resolve until `#init()`
		// returns.
		assert(this.#runtimeEntryURL !== undefined);
		// Return a copy so external mutations don't propagate to `#runtimeEntryURL`
		return new URL(this.#runtimeEntryURL.toString());
	}
	get ready(): Promise<URL> {
		return this.#waitForReady();
	}

	async getCf(): Promise<Record<string, any>> {
		this.#checkDisposed();
		await this.ready;

		return JSON.parse(JSON.stringify(this.#cfObject));
	}

	async getInspectorURL(): Promise<URL> {
		this.#checkDisposed();
		await this.ready;

		// `#socketPorts` is assigned in `#assembleAndUpdateConfig()`, which is
		// called by `#init()`, and `ready` doesn't resolve until `#init()` returns
		assert(this.#socketPorts !== undefined);

		// Try to get inspector port for worker
		const maybePort = this.#socketPorts.get(kInspectorSocket);
		if (maybePort === undefined) {
			throw new TypeError(
				"Inspector not enabled in Miniflare instance. " +
					"Set the `inspectorPort` option to enable it."
			);
		}

		return new URL(`ws://127.0.0.1:${maybePort}`);
	}

	async unsafeGetDirectURL(
		workerName?: string,
		entrypoint = "default"
	): Promise<URL> {
		this.#checkDisposed();
		await this.ready;

		// Get worker index and options from name, defaulting to entrypoint
		const workerIndex = this.#findAndAssertWorkerIndex(workerName);
		const workerOpts = this.#workerOpts[workerIndex];

		// Try to get direct access port for worker
		const socketName = getDirectSocketName(workerIndex, entrypoint);
		// `#socketPorts` is assigned in `#assembleAndUpdateConfig()`, which is
		// called by `#init()`, and `ready` doesn't resolve until `#init()` returns.
		assert(this.#socketPorts !== undefined);
		const maybePort = this.#socketPorts.get(socketName);
		if (maybePort === undefined) {
			const friendlyWorkerName =
				workerName === undefined ? "entrypoint" : JSON.stringify(workerName);
			const friendlyEntrypointName =
				entrypoint === "default" ? entrypoint : JSON.stringify(entrypoint);
			throw new TypeError(
				`Direct access disabled in ${friendlyWorkerName} worker for ${friendlyEntrypointName} entrypoint`
			);
		}

		// Construct accessible URL from configured host and port
		const directSocket = workerOpts.core.unsafeDirectSockets?.find(
			(socket) => (socket.entrypoint ?? "default") === entrypoint
		);
		// Should be able to find socket with correct entrypoint if port assigned
		assert(directSocket !== undefined);
		const host = directSocket.host ?? DEFAULT_HOST;
		const accessibleHost =
			maybeGetLocallyAccessibleHost(host) ?? getURLSafeHost(host);
		// noinspection HttpUrlsUsage
		return new URL(`http://${accessibleHost}:${maybePort}`);
	}

	#checkDisposed() {
		if (this.#disposeController.signal.aborted) {
			throw new MiniflareCoreError(
				"ERR_DISPOSED",
				"Cannot use disposed instance"
			);
		}
	}

	async #setOptions(opts: MiniflareOptions) {
		// This function must be run with `#runtimeMutex` held

		// Split and validate options
		const [sharedOpts, workerOpts] = validateOptions(opts);
		this.#previousSharedOpts = this.#sharedOpts;
		this.#previousWorkerOpts = this.#workerOpts;
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;
		this.#log = this.#sharedOpts.core.log ?? this.#log;

		// Send to runtime and wait for updates to process
		await this.#assembleAndUpdateConfig();
	}

	setOptions(opts: MiniflareOptions): Promise<void> {
		this.#checkDisposed();
		// The `ProxyServer` "heap" will be destroyed when `workerd` restarts,
		// invalidating all existing native references. Mark all proxies as invalid.
		this.#proxyClient?.poisonProxies();
		// Wait for initial initialisation and other setOptions to complete before
		// changing options
		return this.#runtimeMutex.runWith(() => this.#setOptions(opts));
	}

	dispatchFetch: DispatchFetch = async (input, init) => {
		this.#checkDisposed();
		await this.ready;

		assert(this.#runtimeEntryURL !== undefined);
		assert(this.#runtimeDispatcher !== undefined);

		const forward = new Request(input, init);
		const url = new URL(forward.url);
		const actualRuntimeOrigin = this.#runtimeEntryURL.origin;
		const userRuntimeOrigin = url.origin;

		// Rewrite URL for WebSocket requests which won't use `DispatchFetchDispatcher`
		url.protocol = this.#runtimeEntryURL.protocol;
		url.host = this.#runtimeEntryURL.host;

		// Remove `Content-Length: 0` headers from requests when a body is set to
		// avoid `RequestContentLengthMismatch` errors
		if (
			forward.body !== null &&
			forward.headers.get("Content-Length") === "0"
		) {
			forward.headers.delete("Content-Length");
		}

		const cfBlob = forward.cf ? { ...fallbackCf, ...forward.cf } : undefined;
		const dispatcher = new DispatchFetchDispatcher(
			getGlobalDispatcher(),
			this.#runtimeDispatcher,
			actualRuntimeOrigin,
			userRuntimeOrigin,
			cfBlob
		);

		const forwardInit = forward as RequestInit;
		forwardInit.dispatcher = dispatcher;
		const response = await fetch(url, forwardInit);

		// If the Worker threw an uncaught exception, propagate it to the caller
		const stack = response.headers.get(CoreHeaders.ERROR_STACK);
		if (response.status === 500 && stack !== null) {
			const caught = JsonErrorSchema.parse(await response.json());
			throw reviveError(this.#workerSrcOpts, caught);
		}

		// At this point, undici.fetch (used inside fetch, above)
		// has decompressed the response body but retained the Content-Encoding header.
		// This can cause problems for client implementations which rely
		// on the Content-Encoding header rather than trying to infer it from the body.
		// Technically, at this point, this a malformed response so let's remove the header
		// Retain it as MF-Content-Encoding so we can tell the body was actually compressed.
		const contentEncoding = response.headers.get("Content-Encoding");
		if (contentEncoding)
			response.headers.set("MF-Content-Encoding", contentEncoding);
		response.headers.delete("Content-Encoding");

		if (
			process.env.MINIFLARE_ASSERT_BODIES_CONSUMED === "true" &&
			response.body !== null
		) {
			// Throw an uncaught exception if the body from this response isn't
			// consumed "immediately". `undici` may hang or throw socket errors if we
			// don't remember to do this:
			// https://github.com/nodejs/undici/issues/583#issuecomment-1577468249
			const originalLimit = Error.stackTraceLimit;
			Error.stackTraceLimit = Infinity;
			const error = new Error(
				"`body` returned from `Miniflare#dispatchFetch()` not consumed immediately"
			);
			Error.stackTraceLimit = originalLimit;
			setImmediate(() => {
				if (!response.bodyUsed) throw error;
			});
		}

		return response;
	};

	/** @internal */
	async _getProxyClient(): Promise<ProxyClient> {
		this.#checkDisposed();
		await this.ready;
		assert(this.#proxyClient !== undefined);
		return this.#proxyClient;
	}

	#findAndAssertWorkerIndex(workerName?: string): number {
		if (workerName === undefined) {
			return 0;
		} else {
			const index = this.#workerOpts.findIndex(
				({ core }) => (core.name ?? "") === workerName
			);
			if (index === -1) {
				throw new TypeError(`${JSON.stringify(workerName)} worker not found`);
			}
			return index;
		}
	}

	async getBindings<Env = Record<string, unknown>>(
		workerName?: string
	): Promise<Env> {
		const bindings: Record<string, unknown> = {};
		const proxyClient = await this._getProxyClient();

		// Find worker by name, defaulting to entrypoint worker if none specified
		const workerIndex = this.#findAndAssertWorkerIndex(workerName);
		const workerOpts = this.#workerOpts[workerIndex];
		workerName = workerOpts.core.name ?? "";

		// Populate bindings from each plugin
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			// @ts-expect-error `CoreOptionsSchema` has required options which are
			//  missing in other plugins' options.
			const pluginBindings = await plugin.getNodeBindings(workerOpts[key]);
			for (const [name, binding] of Object.entries(pluginBindings)) {
				if (binding instanceof ProxyNodeBinding) {
					const proxyBindingName = getProxyBindingName(key, workerName, name);
					let proxy = proxyClient.env[proxyBindingName];
					assert(
						proxy !== undefined,
						`Expected ${proxyBindingName} to be bound`
					);
					if (binding.proxyOverrideHandler) {
						proxy = new Proxy(proxy, binding.proxyOverrideHandler);
					}
					bindings[name] = proxy;
				} else {
					bindings[name] = binding;
				}
			}
		}

		return bindings as Env;
	}
	async getWorker(workerName?: string): Promise<ReplaceWorkersTypes<Fetcher>> {
		const proxyClient = await this._getProxyClient();

		// Find worker by name, defaulting to entrypoint worker if none specified
		const workerIndex = this.#findAndAssertWorkerIndex(workerName);
		const workerOpts = this.#workerOpts[workerIndex];
		workerName = workerOpts.core.name ?? "";

		// Get a `Fetcher` to that worker (NOTE: the `ProxyServer` Durable Object
		// shares its `env` with Miniflare's entry worker, so has access to routes)
		const bindingName = CoreBindings.SERVICE_USER_ROUTE_PREFIX + workerName;

		const fetcher = proxyClient.env[bindingName];
		if (fetcher === undefined) {
			// `#findAndAssertWorkerIndex()` will throw if a "worker" doesn't exist
			// with the specified name. If this "worker" was used as a wrapped binding
			// though, it won't be added as a service binding, and so will be
			// undefined here. In this case, throw a more specific error.
			const stringName = JSON.stringify(workerName);
			throw new TypeError(
				`${stringName} is being used as a wrapped binding, and cannot be accessed as a worker`
			);
		}
		return fetcher as ReplaceWorkersTypes<Fetcher>;
	}

	async #getProxy<T>(
		pluginName: string,
		bindingName: string,
		workerName?: string
	): Promise<T> {
		const proxyClient = await this._getProxyClient();
		const proxyBindingName = getProxyBindingName(
			pluginName,
			// Default to entrypoint worker if none specified
			workerName ?? this.#workerOpts[0].core.name ?? "",
			bindingName
		);
		const proxy = proxyClient.env[proxyBindingName];
		if (proxy === undefined) {
			// If the user specified an invalid binding/worker name, throw
			const friendlyWorkerName =
				workerName === undefined ? "entrypoint" : JSON.stringify(workerName);
			throw new TypeError(
				`${JSON.stringify(bindingName)} unbound in ${friendlyWorkerName} worker`
			);
		}
		return proxy as T;
	}
	// TODO(someday): would be nice to define these in plugins
	async getCaches(): Promise<ReplaceWorkersTypes<CacheStorage>> {
		const proxyClient = await this._getProxyClient();
		return proxyClient.global
			.caches as unknown as ReplaceWorkersTypes<CacheStorage>;
	}
	getD1Database(bindingName: string, workerName?: string): Promise<D1Database> {
		return this.#getProxy(D1_PLUGIN_NAME, bindingName, workerName);
	}
	getDurableObjectNamespace(
		bindingName: string,
		workerName?: string
	): Promise<ReplaceWorkersTypes<DurableObjectNamespace>> {
		return this.#getProxy(DURABLE_OBJECTS_PLUGIN_NAME, bindingName, workerName);
	}
	getKVNamespace(
		bindingName: string,
		workerName?: string
	): Promise<ReplaceWorkersTypes<KVNamespace>> {
		return this.#getProxy(KV_PLUGIN_NAME, bindingName, workerName);
	}
	getQueueProducer<Body = unknown>(
		bindingName: string,
		workerName?: string
	): Promise<Queue<Body>> {
		return this.#getProxy(QUEUES_PLUGIN_NAME, bindingName, workerName);
	}
	getR2Bucket(
		bindingName: string,
		workerName?: string
	): Promise<ReplaceWorkersTypes<R2Bucket>> {
		return this.#getProxy(R2_PLUGIN_NAME, bindingName, workerName);
	}

	/** @internal */
	_getInternalDurableObjectNamespace(
		pluginName: string,
		serviceName: string,
		className: string
	): Promise<ReplaceWorkersTypes<DurableObjectNamespace>> {
		return this.#getProxy(`${pluginName}-internal`, className, serviceName);
	}

	unsafeGetPersistPaths(): Map<keyof Plugins, string> {
		const result = new Map<keyof Plugins, string>();
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			const sharedOpts = this.#sharedOpts[key];
			// @ts-expect-error `sharedOptions` will match the plugin's type here
			const maybePath = plugin.getPersistPath?.(sharedOpts, this.#tmpPath);
			if (maybePath !== undefined) result.set(key, maybePath);
		}
		return result;
	}

	async dispose(): Promise<void> {
		this.#disposeController.abort();
		// The `ProxyServer` "heap" will be destroyed when `workerd` shuts down,
		// invalidating all existing native references. Mark all proxies as invalid.
		// Note `dispose()`ing the `#proxyClient` implicitly poison's proxies, but
		// we'd like them to be poisoned synchronously here.
		this.#proxyClient?.poisonProxies();
		try {
			await this.#waitForReady(/* disposing */ true);
		} finally {
			// Remove exit hook, we're cleaning up what they would've cleaned up now
			this.#removeExitHook?.();

			// Cleanup as much as possible even if `#init()` threw
			await this.#proxyClient?.dispose();
			await this.#runtime?.dispose();
			await this.#stopLoopbackServer();
			// `rm -rf ${#tmpPath}`, this won't throw if `#tmpPath` doesn't exist
			await fs.promises.rm(this.#tmpPath, { force: true, recursive: true });

			// Remove from instance registry as last step in `finally`, to make sure
			// all dispose steps complete
			maybeInstanceRegistry?.delete(this);
		}
	}
}

export * from "./http";
export * from "./plugins";
export * from "./runtime";
export * from "./shared";
export * from "./workers";
export * from "./merge";
export * from "./zod-format";
