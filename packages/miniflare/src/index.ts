import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { Duplex, Transform, Writable } from "stream";
import { ReadableStream } from "stream/web";
import util from "util";
import zlib from "zlib";
import type {
	CacheStorage,
	D1Database,
	DurableObjectNamespace,
	KVNamespace,
	Queue,
	R2Bucket,
} from "@cloudflare/workers-types/experimental";
import exitHook from "exit-hook";
import { $ as colors$ } from "kleur/colors";
import stoppable from "stoppable";
import { Client } from "undici";
import SCRIPT_MINIFLARE_SHARED from "worker:shared/index";
import SCRIPT_MINIFLARE_ZOD from "worker:shared/zod";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { fallbackCf, setupCf } from "./cf";
import {
	DispatchFetch,
	Headers,
	Request,
	RequestInit,
	Response,
	configureEntrySocket,
	coupleWebSocket,
	fetch,
	getAccessibleHosts,
	registerAllowUnauthorizedDispatcher,
} from "./http";
import {
	D1_PLUGIN_NAME,
	DURABLE_OBJECTS_PLUGIN_NAME,
	DurableObjectClassNames,
	HEADER_CF_BLOB,
	KV_PLUGIN_NAME,
	PLUGIN_ENTRIES,
	PluginServicesOptions,
	Plugins,
	ProxyClient,
	QUEUES_PLUGIN_NAME,
	QueueConsumers,
	QueuesError,
	R2_PLUGIN_NAME,
	ReplaceWorkersTypes,
	SharedOptions,
	WorkerOptions,
	getGlobalServices,
	kProxyNodeBinding,
	maybeGetSitesManifestModule,
	normaliseDurableObject,
} from "./plugins";
import {
	CUSTOM_SERVICE_KNOWN_OUTBOUND,
	CustomServiceKind,
	JsonErrorSchema,
	NameSourceOptions,
	ServiceDesignatorSchema,
	getUserServiceName,
	handlePrettyErrorRequest,
	reviveError,
} from "./plugins/core";
import {
	Config,
	Extension,
	Runtime,
	RuntimeOptions,
	Service,
	Socket,
	Worker_Binding,
	Worker_Module,
	serializeConfig,
} from "./runtime";
import {
	Log,
	MiniflareCoreError,
	NoOpLog,
	OptionalZodTypeOf,
	stripAnsi,
} from "./shared";
import {
	CoreBindings,
	CoreHeaders,
	LogLevel,
	Mutex,
	SharedHeaders,
	maybeApply,
} from "./workers";
import { _formatZodError } from "./zod-format";

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

	// Validate all options
	try {
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			// @ts-expect-error types of individual plugin options are unknown
			pluginSharedOpts[key] = plugin.sharedOptions?.parse(sharedOpts);
			for (let i = 0; i < workerOpts.length; i++) {
				// Make sure paths are correct in validation errors
				const path = multipleWorkers ? ["workers", i] : undefined;
				// @ts-expect-error types of individual plugin options are unknown
				pluginWorkerOpts[i][key] = plugin.options.parse(workerOpts[i], {
					path,
				});
			}
		}
	} catch (e) {
		if (e instanceof z.ZodError) {
			let formatted: string | undefined;
			try {
				formatted = _formatZodError(e, opts);
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
				unsafeUniqueKey,
			} = normaliseDurableObject(designator);
			// Get or create `Map` mapping class name to optional unsafe unique key
			let classNames = serviceClassNames.get(serviceName);
			if (classNames === undefined) {
				classNames = new Map();
				serviceClassNames.set(serviceName, classNames);
			}
			if (classNames.has(className)) {
				// If we've already seen this class in this service, make sure the
				// unsafe unique keys match
				const existingUnsafeUniqueKey = classNames.get(className);
				if (existingUnsafeUniqueKey !== unsafeUniqueKey) {
					throw new MiniflareCoreError(
						"ERR_DIFFERENT_UNIQUE_KEYS",
						`Multiple unsafe unique keys defined for Durable Object "${className}" in "${serviceName}": ${JSON.stringify(
							unsafeUniqueKey
						)} and ${JSON.stringify(existingUnsafeUniqueKey)}`
					);
				}
			} else {
				// Otherwise, just add it
				classNames.set(className, unsafeUniqueKey);
			}
		}
	}
	return serviceClassNames;
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
	allWorkerOpts: PluginWorkerOptions[]
): Map<string, string[]> {
	const allRoutes = new Map<string, string[]>();
	for (const workerOpts of allWorkerOpts) {
		const name = workerOpts.core.name ?? "";
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

export function _transformsForContentEncoding(encoding?: string): Transform[] {
	const encoders: Transform[] = [];
	if (!encoding) return encoders;

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
	const encoders = _transformsForContentEncoding(encoding);
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
	return new ReadableStream<Uint8Array>(
		{
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
		},
		0
	);
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
	#sharedOpts: PluginSharedOptions;
	#workerOpts: PluginWorkerOptions[];
	#log: Log;
	readonly #host: string;
	readonly #accessibleHost: string;

	#runtime?: Runtime;
	#removeRuntimeExitHook?: () => void;
	#runtimeEntryURL?: URL;
	#runtimeClient?: Client;
	#proxyClient?: ProxyClient;

	// Path to temporary directory for use as scratch space/"in-memory" Durable
	// Object storage. Note this may not exist, it's up to the consumers to
	// create this if needed. Deleted on `dispose()`.
	readonly #tmpPath: string;
	readonly #removeTmpPathExitHook: () => void;

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
	#loopbackPort?: number;
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
		this.#host = this.#sharedOpts.core.host ?? "127.0.0.1";
		this.#accessibleHost =
			this.#host === "*" || this.#host === "0.0.0.0" || this.#host === "::"
				? "127.0.0.1"
				: this.#host;

		if (net.isIPv6(this.#accessibleHost)) {
			this.#accessibleHost = `[${this.#accessibleHost}]`;
		}

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
		this.#removeTmpPathExitHook = exitHook(() => {
			fs.rmSync(this.#tmpPath, { force: true, recursive: true });
		});

		this.#disposeController = new AbortController();
		this.#runtimeMutex = new Mutex();
		this.#initPromise = this.#runtimeMutex
			.runWith(() => this.#init())
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

	async #init() {
		// This function must be run with `#runtimeMutex` held

		// Start loopback server (how the runtime accesses with Miniflare's storage)
		// using the same host as the main runtime server. This means we can use the
		// loopback server for live reload updates too.
		this.#loopbackServer = await this.#startLoopbackServer(0, this.#host);
		const address = this.#loopbackServer.address();
		// Note address would be string with unix socket
		assert(address !== null && typeof address === "object");
		// noinspection JSObjectNullOrUndefined
		this.#loopbackPort = address.port;

		// Start runtime
		const port = this.#sharedOpts.core.port ?? 0;
		const opts: RuntimeOptions = {
			entryHost: net.isIPv6(this.#host) ? `[${this.#host}]` : this.#host,
			entryPort: port,
			loopbackPort: this.#loopbackPort,
			inspectorPort: this.#sharedOpts.core.inspectorPort,
			verbose: this.#sharedOpts.core.verbose,
		};
		this.#runtime = new Runtime(opts);
		this.#removeRuntimeExitHook = exitHook(() => void this.#runtime?.dispose());

		// Update config and wait for runtime to start
		await this.#assembleAndUpdateConfig();
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
			const response = await service(request);
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
		const cfBlob = headers.get(HEADER_CF_BLOB);
		headers.delete(HEADER_CF_BLOB);
		assert(!Array.isArray(cfBlob)); // Only `Set-Cookie` headers are arrays
		const cf = cfBlob ? JSON.parse(cfBlob) : undefined;

		// Extract original URL passed to `fetch`
		const url = new URL(
			headers.get(CoreHeaders.ORIGINAL_URL) ?? req.url ?? "",
			"http://localhost"
		);
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

	#startLoopbackServer(
		port: number,
		hostname: string
	): Promise<StoppableServer> {
		if (hostname === "*") {
			hostname = "::";
		}

		return new Promise((resolve) => {
			const server = stoppable(
				http.createServer(this.#handleLoopback),
				/* grace */ 0
			);
			server.on("upgrade", this.#handleLoopbackUpgrade);
			server.listen(port, hostname, () => resolve(server));
		});
	}

	#stopLoopbackServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			assert(this.#loopbackServer !== undefined);
			this.#loopbackServer.stop((err) => (err ? reject(err) : resolve()));
		});
	}

	async #assembleConfig(): Promise<Config> {
		const allWorkerOpts = this.#workerOpts;
		const sharedOpts = this.#sharedOpts;
		const loopbackPort = this.#loopbackPort;
		// #assembleConfig is always called after the loopback server is created
		assert(loopbackPort !== undefined);

		sharedOpts.core.cf = await setupCf(this.#log, sharedOpts.core.cf);

		const durableObjectClassNames = getDurableObjectClassNames(allWorkerOpts);
		const queueConsumers = getQueueConsumers(allWorkerOpts);
		const allWorkerRoutes = getWorkerRoutes(allWorkerOpts);
		const workerNames = [...allWorkerRoutes.keys()];

		// Use Map to dedupe services by name
		const services = new Map<string, Service>();

		const sockets: Socket[] = [await configureEntrySocket(sharedOpts.core)];
		// Bindings for `ProxyServer` Durable Object
		const proxyBindings: Worker_Binding[] = [];

		for (let i = 0; i < allWorkerOpts.length; i++) {
			const workerOpts = allWorkerOpts[i];
			const workerName = workerOpts.core.name ?? "";

			// Collect all bindings from this worker
			const workerBindings: Worker_Binding[] = [];
			const additionalModules: Worker_Module[] = [];
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				// @ts-expect-error `CoreOptionsSchema` has required options which are
				//  missing in other plugins' options.
				const pluginBindings = await plugin.getBindings(workerOpts[key], i);
				if (pluginBindings !== undefined) {
					for (const binding of pluginBindings) {
						workerBindings.push(binding);
						// Only `workerd` native bindings need to be proxied, the rest are
						// already supported by Node.js (e.g. json, text/data blob, wasm)
						if (isNativeTargetBinding(binding)) {
							proxyBindings.push(buildProxyBinding(key, workerName, binding));
						}
					}

					if (key === "kv") {
						// Add "__STATIC_CONTENT_MANIFEST" module if sites enabled
						const module = maybeGetSitesManifestModule(pluginBindings);
						if (module !== undefined) additionalModules.push(module);
					}
				}
			}

			// Collect all services required by this worker
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
				durableObjectClassNames,
				queueConsumers,
			};
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginServices = await plugin.getServices({
					...pluginServicesOptionsBase,
					// @ts-expect-error `CoreOptionsSchema` has required options which are
					//  missing in other plugins' options.
					options: workerOpts[key],
					// @ts-expect-error `QueuesPlugin` doesn't define shared options
					sharedOptions: sharedOpts[key],
				});
				if (pluginServices !== undefined) {
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
		}

		// For testing proxy client serialisation, add an API that just returns its
		// arguments. Note without the `.pipeThrough(new TransformStream())` below,
		// we'll see `TypeError: Inter-TransformStream ReadableStream.pipeTo() is
		// not implemented.`. `IdentityTransformStream` doesn't work here.
		// TODO(soon): add support for wrapped bindings and remove this. The API
		//  will probably look something like `{ wrappedBindings: { A: "a" } }`
		//  where `"a"` is the name of a "worker" in `workers`.
		const extensions: Extension[] = [
			{
				modules: [
					{ name: "miniflare:shared", esModule: SCRIPT_MINIFLARE_SHARED() },
					{ name: "miniflare:zod", esModule: SCRIPT_MINIFLARE_ZOD() },
				],
			},
			{
				modules: [
					{
						name: "miniflare-internal:identity",
						internal: true, // Not accessible to user code
						esModule: `
            class Identity {
              async asyncIdentity(...args) {
                const i = args.findIndex((arg) => arg instanceof ReadableStream);
                if (i !== -1) args[i] = args[i].pipeThrough(new TransformStream());
                return args;
              }
            }
            export default function() { return new Identity(); }
            `,
					},
				],
			},
		];
		proxyBindings.push({
			name: "IDENTITY",
			wrapped: { moduleName: "miniflare-internal:identity" },
		});

		const globalServices = getGlobalServices({
			sharedOptions: sharedOpts.core,
			allWorkerRoutes,
			fallbackWorkerName: this.#workerOpts[0].core.name,
			loopbackPort,
			log: this.#log,
			proxyBindings,
		});
		for (const service of globalServices) {
			// Global services should all have unique names
			assert(service.name !== undefined && !services.has(service.name));
			services.set(service.name, service);
		}

		return { services: Array.from(services.values()), sockets, extensions };
	}

	async #assembleAndUpdateConfig() {
		const initial = !this.#runtimeEntryURL;
		assert(this.#runtime !== undefined);
		const config = await this.#assembleConfig();
		const configBuffer = serializeConfig(config);
		const maybePort = await this.#runtime.updateConfig(configBuffer, {
			signal: this.#disposeController.signal,
			entryPort: maybeApply(parseInt, this.#runtimeEntryURL?.port),
		});
		if (this.#disposeController.signal.aborted) return;
		if (maybePort === undefined) {
			throw new MiniflareCoreError(
				"ERR_RUNTIME_FAILURE",
				"The Workers runtime failed to start. " +
					"There is likely additional logging output above."
			);
		}

		const entrySocket = config.sockets?.[0];
		const secure = entrySocket !== undefined && "https" in entrySocket;

		// noinspection HttpUrlsUsage
		const previousEntry = this.#runtimeEntryURL;
		this.#runtimeEntryURL = new URL(
			`${secure ? "https" : "http"}://${this.#accessibleHost}:${maybePort}`
		);
		if (previousEntry?.toString() !== this.#runtimeEntryURL.toString()) {
			this.#runtimeClient = new Client(this.#runtimeEntryURL, {
				connect: { rejectUnauthorized: false },
			});
			registerAllowUnauthorizedDispatcher(this.#runtimeClient);
		}
		if (this.#proxyClient === undefined) {
			this.#proxyClient = new ProxyClient(
				this.#runtimeEntryURL,
				this.dispatchFetch
			);
		} else {
			// The `ProxyServer` "heap" will have been destroyed when `workerd` was
			// restarted, invalidating all existing native target references. Mark
			// all proxies as invalid, noting the new runtime URL to send requests to.
			this.#proxyClient.poisonProxies(this.#runtimeEntryURL);
		}

		if (!this.#runtimeMutex.hasWaiting) {
			// Only log and trigger reload if there aren't pending updates
			const ready = initial ? "Ready" : "Updated and ready";

			const host = net.isIPv6(this.#host) ? `[${this.#host}]` : this.#host;
			this.#log.info(
				`${ready} on ${secure ? "https" : "http"}://${host}:${maybePort} `
			);

			if (initial) {
				let hosts: string[];
				if (this.#host === "::" || this.#host === "*") {
					hosts = getAccessibleHosts(false);
				} else if (this.#host === "0.0.0.0") {
					hosts = getAccessibleHosts(true);
				} else {
					hosts = [];
				}

				for (const h of hosts) {
					this.#log.info(`- ${secure ? "https" : "http"}://${h}:${maybePort}`);
				}
			}

			this.#handleReload();
		}
	}

	async #waitForReady() {
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
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;
		this.#log = this.#sharedOpts.core.log ?? this.#log;

		// Send to runtime and wait for updates to process
		await this.#assembleAndUpdateConfig();
	}

	setOptions(opts: MiniflareOptions): Promise<void> {
		this.#checkDisposed();
		// Wait for initial initialisation and other setOptions to complete before
		// changing options
		return this.#runtimeMutex.runWith(() => this.#setOptions(opts));
	}

	dispatchFetch: DispatchFetch = async (input, init) => {
		this.#checkDisposed();
		await this.ready;

		assert(this.#runtimeEntryURL !== undefined);
		assert(this.#runtimeClient !== undefined);

		const forward = new Request(input, init);
		const url = new URL(forward.url);
		forward.headers.set(CoreHeaders.ORIGINAL_URL, url.toString());
		url.protocol = this.#runtimeEntryURL.protocol;
		url.host = this.#runtimeEntryURL.host;
		if (forward.cf) {
			const cf = { ...fallbackCf, ...forward.cf };
			forward.headers.set(HEADER_CF_BLOB, JSON.stringify(cf));
		}
		// Remove `Content-Length: 0` headers from requests when a body is set to
		// avoid `RequestContentLengthMismatch` errors
		if (
			forward.body !== null &&
			forward.headers.get("Content-Length") === "0"
		) {
			forward.headers.delete("Content-Length");
		}

		const forwardInit = forward as RequestInit;
		forwardInit.dispatcher = this.#runtimeClient;
		const response = await fetch(url, forwardInit);

		// If the Worker threw an uncaught exception, propagate it to the caller
		const stack = response.headers.get(CoreHeaders.ERROR_STACK);
		if (response.status === 500 && stack !== null) {
			const caught = JsonErrorSchema.parse(await response.json());
			throw reviveError(this.#workerSrcOpts, caught);
		}

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

	async getBindings<Env = Record<string, unknown>>(
		workerName?: string
	): Promise<Env> {
		const bindings: Record<string, unknown> = {};
		const proxyClient = await this._getProxyClient();

		// Find worker by name, defaulting to entrypoint worker if none specified
		let workerOpts: PluginWorkerOptions | undefined;
		if (workerName === undefined) {
			workerOpts = this.#workerOpts[0];
		} else {
			workerOpts = this.#workerOpts.find(
				({ core }) => (core.name ?? "") === workerName
			);
			if (workerOpts === undefined) {
				throw new TypeError(`${JSON.stringify(workerName)} worker not found`);
			}
		}
		workerName = workerOpts.core.name ?? "";

		// Populate bindings from each plugin
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			// @ts-expect-error `CoreOptionsSchema` has required options which are
			//  missing in other plugins' options.
			const pluginBindings = await plugin.getNodeBindings(workerOpts[key]);
			for (const [name, binding] of Object.entries(pluginBindings)) {
				if (binding === kProxyNodeBinding) {
					const proxyBindingName = getProxyBindingName(key, workerName, name);
					const proxy = proxyClient.env[proxyBindingName];
					assert(
						proxy !== undefined,
						`Expected ${proxyBindingName} to be bound`
					);
					bindings[name] = proxy;
				} else {
					bindings[name] = binding;
				}
			}
		}

		return bindings as Env;
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

	async dispose(): Promise<void> {
		this.#disposeController.abort();
		try {
			await this.ready;
		} finally {
			// Remove exit hooks, we're cleaning up what they would've cleaned up now
			this.#removeTmpPathExitHook();
			this.#removeRuntimeExitHook?.();

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
export * from "./zod-format";
