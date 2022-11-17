import assert from "assert";
import http from "http";
import net from "net";
import { Duplex } from "stream";
import exitHook from "exit-hook";
import getPort from "get-port";
import stoppable from "stoppable";
import {
	HeadersInit,
	Request,
	RequestInfo,
	RequestInit,
	Response,
	fetch,
} from "undici";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { setupCf } from "./cf";
import {
	GatewayConstructor,
	GatewayFactory,
	HEADER_PROBE,
	PLUGIN_ENTRIES,
	Plugins,
	SERVICE_ENTRY,
	SOCKET_ENTRY,
	maybeGetSitesManifestModule,
	normaliseDurableObject,
} from "./plugins";
import { HEADER_CUSTOM_SERVICE, getUserServiceName } from "./plugins/core";
import {
	Config,
	Runtime,
	RuntimeConstructor,
	RuntimeOptions,
	Service,
	Socket,
	Worker_Binding,
	Worker_Module,
	getSupportedRuntime,
	serializeConfig,
} from "./runtime";
import {
	HttpError,
	Log,
	MiniflareCoreError,
	Mutex,
	NoOpLog,
	OptionalZodTypeOf,
	UnionToIntersection,
	ValueOf,
} from "./shared";
import { anyAbortSignal } from "./shared/signal";
import { waitForRequest } from "./wait";

// ===== `Miniflare` User Options =====
export type WorkerOptions = UnionToIntersection<
	z.infer<ValueOf<Plugins>["options"]>
>;
export type SharedOptions = UnionToIntersection<
	z.infer<Exclude<ValueOf<Plugins>["sharedOptions"], undefined>>
>;
export type MiniflareOptions = SharedOptions &
	(WorkerOptions | { workers: WorkerOptions[] });

// ===== `Miniflare` Validated Options =====
type PluginWorkerOptions = {
	[Key in keyof Plugins]: z.infer<Plugins[Key]["options"]>;
};
type PluginSharedOptions = {
	[Key in keyof Plugins]: OptionalZodTypeOf<Plugins[Key]["sharedOptions"]>;
};

function validateOptions(
	opts: MiniflareOptions
): [PluginSharedOptions, PluginWorkerOptions[]] {
	// Normalise options into shared and worker-specific
	const sharedOpts = opts;
	const multipleWorkers = "workers" in opts;
	const workerOpts = multipleWorkers ? opts.workers : [opts];

	// Initialise return values
	const pluginSharedOpts = {} as PluginSharedOptions;
	const pluginWorkerOpts = Array.from(Array(workerOpts.length)).map(
		() => ({}) as PluginWorkerOptions
	);

	// Validate all options
	for (const [key, plugin] of PLUGIN_ENTRIES) {
		// @ts-expect-error pluginSharedOpts[key] could be any plugin's
		pluginSharedOpts[key] = plugin.sharedOptions?.parse(sharedOpts);
		for (let i = 0; i < workerOpts.length; i++) {
			// Make sure paths are correct in validation errors
			const path = multipleWorkers ? ["workers", i] : undefined;
			// @ts-expect-error pluginWorkerOpts[i][key] could be any plugin's
			pluginWorkerOpts[i][key] = plugin.options.parse(workerOpts[i], { path });
		}
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
): Map<string, string[]> {
	const serviceClassNames = new Map<string, string[]>();
	for (const workerOpts of allWorkerOpts) {
		const workerServiceName = getUserServiceName(workerOpts.core.name);
		for (const designator of Object.values(
			workerOpts.do.durableObjects ?? {}
		)) {
			// Fallback to current worker service if name not defined
			const [className, serviceName = workerServiceName] =
				normaliseDurableObject(designator);
			let classNames = serviceClassNames.get(serviceName);
			if (classNames === undefined) {
				serviceClassNames.set(serviceName, (classNames = []));
			}
			classNames.push(className);
		}
	}
	return serviceClassNames;
}

// ===== `Miniflare` Internal Storage & Routing =====
type OptionalGatewayFactoryType<
	Gateway extends GatewayConstructor<any> | undefined,
> = Gateway extends GatewayConstructor<any>
	? GatewayFactory<InstanceType<Gateway>>
	: undefined;
type OptionalInstanceType<
	T extends (abstract new (...args: any) => any) | undefined,
> = T extends abstract new (...args: any) => any ? InstanceType<T> : undefined;
type PluginGatewayFactories = {
	[Key in keyof Plugins]: OptionalGatewayFactoryType<Plugins[Key]["gateway"]>;
};
type PluginRouters = {
	[Key in keyof Plugins]: OptionalInstanceType<Plugins[Key]["router"]>;
};

type StoppableServer = http.Server & stoppable.WithStop;

export class Miniflare {
	readonly #gatewayFactories: PluginGatewayFactories;
	readonly #routers: PluginRouters;
	#optionsVersion: number;
	#sharedOpts: PluginSharedOptions;
	#workerOpts: PluginWorkerOptions[];
	#log: Log;

	readonly #runtimeConstructor: RuntimeConstructor;
	#runtime?: Runtime;
	#removeRuntimeExitHook?: () => void;
	#runtimeEntryURL?: URL;

	// Mutual exclusion lock for runtime operations (i.e. initialisation and
	// updating config). This essentially puts initialisation and future updates
	// in a queue, ensuring they're performed in calling order.
	readonly #runtimeMutex: Mutex;

	// Additionally, store `Promise`s for the call to `#init()` and the last call
	// to `setOptions()`. We need the `#init()` `Promise`, so we can propagate
	// initialisation errors in `ready`. We would have no way of catching these
	// otherwise.
	//
	// We store the last `setOptions()` `Promise` as well, so we can avoid
	// disposing or resolving `ready` until all pending `setOptions()` have
	// completed. Note we only need to store the latest one, as the mutex queue
	// will ensure all previous calls complete before starting the latest.
	//
	// We could just wait on the mutex when disposing/resolving `ready`, but we
	// use the presence of waiters on the mutex to avoid logging ready/updated
	// messages to the console if there are future updates.
	readonly #initPromise: Promise<void>;
	#lastUpdatePromise?: Promise<void>;

	// Aborted when dispose() is called
	readonly #disposeController: AbortController;
	#loopbackServer?: StoppableServer;
	#loopbackPort?: number;
	readonly #liveReloadServer: WebSocketServer;

	constructor(opts: MiniflareOptions) {
		// Initialise plugin gateway factories and routers
		this.#gatewayFactories = {} as PluginGatewayFactories;
		this.#routers = {} as PluginRouters;

		// Split and validate options
		const [sharedOpts, workerOpts] = validateOptions(opts);
		this.#optionsVersion = 1;
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;
		this.#log = this.#sharedOpts.core.log ?? new NoOpLog();
		this.#initPlugins();

		// Get supported shell for executing runtime binary
		// TODO: allow this to be configured if necessary
		this.#runtimeConstructor = getSupportedRuntime();
		const desc = this.#runtimeConstructor.description;
		this.#log.debug(`Running workerd ${desc}...`);

		this.#disposeController = new AbortController();
		this.#liveReloadServer = new WebSocketServer({ noServer: true });
		this.#runtimeMutex = new Mutex();
		this.#initPromise = this.#runtimeMutex.runWith(() => this.#init());
	}

	#initPlugins() {
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			if (plugin.gateway !== undefined && plugin.router !== undefined) {
				const gatewayFactory = new GatewayFactory<any>(
					this.#log,
					this.#sharedOpts.core.cloudflareFetch,
					key,
					plugin.gateway,
					plugin.remoteStorage
				);
				const router = new plugin.router(this.#log, gatewayFactory);
				// @ts-expect-error this.#gatewayFactories[key] could be any plugin's
				this.#gatewayFactories[key] = gatewayFactory;
				// @ts-expect-error this.#routers[key] could be any plugin's
				this.#routers[key] = router;
			}
		}
	}

	#handleReload() {
		// Reload all connected live reload clients
		for (const ws of this.#liveReloadServer.clients) {
			ws.close(1012, "Service Restart");
		}
	}

	async #init() {
		// This function must be run with `#runtimeMutex` held

		// Start loopback server (how the runtime accesses with Miniflare's storage)
		// using the same host as the main runtime server. This means we can use the
		// loopback server for live reload updates too.
		const host = this.#sharedOpts.core.host ?? "127.0.0.1";
		this.#loopbackServer = await this.#startLoopbackServer(0, host);
		const address = this.#loopbackServer.address();
		// Note address would be string with unix socket
		assert(address !== null && typeof address === "object");
		// noinspection JSObjectNullOrUndefined
		this.#loopbackPort = address.port;

		// Start runtime
		const opts: RuntimeOptions = {
			entryHost: host,
			entryPort: this.#sharedOpts.core.port ?? (await getPort({ port: 8787 })),
			loopbackPort: this.#loopbackPort,
			inspectorPort: this.#sharedOpts.core.inspectorPort,
			verbose: this.#sharedOpts.core.verbose,
		};
		this.#runtime = new this.#runtimeConstructor(opts);
		this.#removeRuntimeExitHook = exitHook(() => void this.#runtime?.dispose());
		this.#runtimeEntryURL = new URL(`http://127.0.0.1:${opts.entryPort}`);

		const config = await this.#assembleConfig();
		assert(config !== undefined);
		const configBuffer = serializeConfig(config);
		await this.#runtime.updateConfig(configBuffer);

		// Wait for runtime to start
		if ((await this.#waitForRuntime()) && !this.#runtimeMutex.hasWaiting) {
			// Only log and trigger reload if there aren't pending updates
			this.#log.info(`Ready on ${this.#runtimeEntryURL}`);
			this.#handleReload();
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
		const serviceName = customService.substring(slashIndex + 1);
		const service =
			this.#workerOpts[workerIndex]?.core.serviceBindings?.[serviceName];
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

	async #handleLoopbackPlugins(
		request: Request,
		url: URL
	): Promise<Response | undefined> {
		const pathname = url.pathname;
		for (const [key] of PLUGIN_ENTRIES) {
			const pluginPrefix = `/${key}`;
			if (pathname.startsWith(pluginPrefix)) {
				// Reuse existing URL object, just remove prefix from pathname
				url.pathname = pathname.substring(pluginPrefix.length);
				// Try route using this plugin, and respond if matched
				try {
					const response = await this.#routers[key]?.route(request, url);
					if (response !== undefined) return response;
				} catch (e) {
					if (e instanceof HttpError) {
						return new Response(e.message, {
							status: e.code,
							// Custom statusMessage is required for runtime error messages
							statusText: e.message.substring(0, 512),
						});
					}
					throw e;
				}
			}
		}
	}

	#handleLoopback: http.RequestListener = async (req, res) => {
		const url = new URL(req.url ?? "", "http://127.0.0.1");
		// TODO: maybe just use native Node http objects?
		const request = new Request(url, {
			method: req.method,
			headers: req.headers as HeadersInit,
			body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
			duplex: "half",
		});

		let response: Response | undefined;
		const customService = request.headers.get(HEADER_CUSTOM_SERVICE);
		if (customService !== null) {
			response = await this.#handleLoopbackCustomService(
				request,
				customService
			);
		} else {
			// TODO: check for proxying/outbound fetch header first (with plans for fetch mocking)
			response = await this.#handleLoopbackPlugins(request, url);
		}

		if (response === undefined) {
			res.writeHead(404);
			return res.end();
		}

		res.writeHead(
			response.status,
			response.statusText,
			Object.fromEntries(response.headers)
		);
		if (response.body) {
			for await (const chunk of response.body) {
				if (chunk) res.write(chunk);
			}
		}
		res.end();
	};

	#handleLoopbackUpgrade = (
		req: http.IncomingMessage,
		socket: Duplex,
		head: Buffer
	) => {
		// Only interested in pathname so base URL doesn't matter
		const { pathname } = new URL(req.url ?? "", "http://localhost");

		// If this is the path for live-reload, handle the request
		if (pathname === "/core/reload") {
			this.#liveReloadServer.handleUpgrade(req, socket, head, (ws) => {
				this.#liveReloadServer.emit("connection", ws, req);
			});
			return;
		}

		// Otherwise, return a not found HTTP response
		const res = new http.ServerResponse(req);
		// `socket` is guaranteed to be an instance of `net.Socket`:
		// https://nodejs.org/api/http.html#event-upgrade_1
		assert(socket instanceof net.Socket);
		res.assignSocket(socket);
		res.writeHead(404);
		res.end();
	};

	#startLoopbackServer(
		port: string | number,
		hostname?: string
	): Promise<StoppableServer> {
		return new Promise((resolve) => {
			const server = stoppable(http.createServer(this.#handleLoopback));
			server.on("upgrade", this.#handleLoopbackUpgrade);
			server.listen(port as any, hostname, () => resolve(server));
		});
	}

	#stopLoopbackServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			assert(this.#loopbackServer !== undefined);
			this.#loopbackServer.stop((err) => (err ? reject(err) : resolve()));
		});
	}

	async #waitForRuntime() {
		assert(this.#runtime !== undefined);

		// Setup controller aborted when runtime exits
		const exitController = new AbortController();
		this.#runtime.exitPromise?.then(() => exitController.abort());

		// Wait for the runtime to start by repeatedly sending probe HTTP requests
		// until either:
		// 1) The runtime responds with an OK response
		// 2) The runtime exits
		// 3) The Miniflare instance is disposed
		const signal = anyAbortSignal(
			exitController.signal,
			this.#disposeController.signal
		);
		await waitForRequest(this.#runtimeEntryURL!, {
			headers: { [HEADER_PROBE]: this.#optionsVersion.toString() },
			signal,
		});

		// If we stopped waiting because of reason 2), something's gone wrong
		const disposeAborted = this.#disposeController.signal.aborted;
		const exitAborted = exitController.signal.aborted;
		if (!disposeAborted && exitAborted) {
			throw new MiniflareCoreError(
				"ERR_RUNTIME_FAILURE",
				"The Workers runtime failed to start. " +
					"There is likely additional logging output above."
			);
		}

		return !(disposeAborted || exitAborted);
	}

	async #assembleConfig(): Promise<Config> {
		const optionsVersion = this.#optionsVersion;
		const allWorkerOpts = this.#workerOpts;
		const sharedOpts = this.#sharedOpts;
		const loopbackPort = this.#loopbackPort;
		// #assembleConfig is always called after the loopback server is created
		assert(loopbackPort !== undefined);

		sharedOpts.core.cf = await setupCf(this.#log, sharedOpts.core.cf);

		const services: Service[] = [];
		const sockets: Socket[] = [
			{
				name: SOCKET_ENTRY,
				http: {},
				service: { name: SERVICE_ENTRY },
			},
		];

		const durableObjectClassNames = getDurableObjectClassNames(allWorkerOpts);

		// Dedupe services by name
		const serviceNames = new Set<string>();

		for (let i = 0; i < allWorkerOpts.length; i++) {
			const workerOpts = allWorkerOpts[i];

			// Collect all bindings from this worker
			const workerBindings: Worker_Binding[] = [];
			const additionalModules: Worker_Module[] = [];
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginBindings = await plugin.getBindings(workerOpts[key]);
				if (pluginBindings !== undefined) {
					workerBindings.push(...pluginBindings);

					if (key === "kv") {
						// Add "__STATIC_CONTENT_MANIFEST" module if sites enabled
						const module = maybeGetSitesManifestModule(pluginBindings);
						if (module !== undefined) additionalModules.push(module);
					}
				}
			}

			// Collect all services required by this worker
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginServices = await plugin.getServices({
					log: this.#log,
					options: workerOpts[key],
					optionsVersion,
					sharedOptions: sharedOpts[key],
					workerBindings,
					workerIndex: i,
					durableObjectClassNames,
					additionalModules,
					loopbackPort,
				});
				if (pluginServices !== undefined) {
					for (const service of pluginServices) {
						if (service.name !== undefined && !serviceNames.has(service.name)) {
							serviceNames.add(service.name);
							services.push(service);
						}
					}
				}
			}
		}

		return { services, sockets };
	}

	get ready(): Promise<URL> {
		// If `#init()` threw, we'd like to propagate the error here, so `await` it.
		// Note we can't use `async`/`await` with getters. We'd also like to wait
		// for `setOptions` calls to complete before resolving.
		//
		// Safety of `!`: `#runtimeEntryURL` is assigned in `#init()`.
		// `#initPromise` doesn't resolve until `#init()` returns.
		return this.#initPromise
			.then(() => this.#lastUpdatePromise)
			.then(() => this.#runtimeEntryURL!);
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
		// TODO: merge with previous config
		const [sharedOpts, workerOpts] = validateOptions(opts);
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;
		this.#log = this.#sharedOpts.core.log ?? this.#log;

		// Increment version, so we know when the runtime has processed updates
		this.#optionsVersion++;
		// Assemble and serialize config using new version
		const config = await this.#assembleConfig();
		const configBuffer = serializeConfig(config);

		// Send to runtime and wait for updates to process
		assert(this.#runtime !== undefined);
		await this.#runtime.updateConfig(configBuffer);

		if ((await this.#waitForRuntime()) && !this.#runtimeMutex.hasWaiting) {
			// Only log and trigger reload if this was the last pending update
			this.#log.info(`Updated and ready on ${this.#runtimeEntryURL}`);
			this.#handleReload();
		}
	}

	setOptions(opts: MiniflareOptions): Promise<void> {
		this.#checkDisposed();
		// Wait for initial initialisation and other setOptions to complete before
		// changing options
		const promise = this.#runtimeMutex.runWith(() => this.#setOptions(opts));
		this.#lastUpdatePromise = promise;
		return promise;
	}

	async dispatchFetch(
		input: RequestInfo,
		init?: RequestInit
	): Promise<Response> {
		this.#checkDisposed();
		await this.ready;
		const forward = new Request(input, init);
		const url = new URL(forward.url);
		url.host = this.#runtimeEntryURL!.host;
		return fetch(url, forward as RequestInit);
	}

	async dispose(): Promise<void> {
		this.#disposeController.abort();
		try {
			await this.#initPromise;
			await this.#lastUpdatePromise;
		} finally {
			// Cleanup as much as possible even if `#init()` threw
			this.#removeRuntimeExitHook?.();
			this.#runtime?.dispose();
			await this.#stopLoopbackServer();
		}
	}
}

export * from "./plugins";
export * from "./runtime";
export * from "./shared";
export * from "./storage";
