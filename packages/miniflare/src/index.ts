import assert from "assert";
import http from "http";
import path from "path";
import util from "util";
import getPort from "get-port";
import { bold, dim, green, grey } from "kleur/colors";
import stoppable from "stoppable";
import { HeadersInit, Request, Response } from "undici";
import { z } from "zod";
import {
	DeferredPromise,
	HttpError,
	MiniflareError,
	OptionalZodTypeOf,
	UnionToIntersection,
	ValueOf,
} from "./helpers";
import {
	GatewayConstructor,
	GatewayFactory,
	HEADER_PROBE,
	PLUGIN_ENTRIES,
	Plugins,
	SERVICE_ENTRY,
	SOCKET_ENTRY,
} from "./plugins";
import { HEADER_CUSTOM_SERVICE } from "./plugins/core";
import {
	Config,
	Runtime,
	RuntimeConstructor,
	Service,
	Socket,
	Worker_Binding,
	getSupportedRuntime,
	serializeConfig,
} from "./runtime";
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

const RUNTIME_PATH = path.resolve(__dirname, "..", "..", "lib", "cfwrkr");

type StoppableServer = http.Server & stoppable.WithStop;

export class Miniflare {
	readonly #gatewayFactories: PluginGatewayFactories;
	readonly #routers: PluginRouters;

	#optionsVersion: number;
	#sharedOpts: PluginSharedOptions;
	#workerOpts: PluginWorkerOptions[];
	#initialConfigPromise?: Promise<Config>;

	readonly #runtimeConstructor: RuntimeConstructor;
	#runtime?: Runtime;
	#runtimeEntryURL?: URL;

	readonly #disposeController: AbortController;
	readonly #initPromise: Promise<void>;
	#loopbackServer?: StoppableServer;

	#updatePromise?: Promise<void>;

	constructor(opts: MiniflareOptions) {
		// Initialise plugin gateway factories and routers
		this.#gatewayFactories = {} as PluginGatewayFactories;
		this.#routers = {} as PluginRouters;
		this.#initPlugins();

		// Split and validate options
		const [sharedOpts, workerOpts] = validateOptions(opts);
		this.#optionsVersion = 1;
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;
		// Assemble config asynchronously whilst initialising finishes
		this.#initialConfigPromise = this.#assembleConfig();

		// Get supported shell for executing runtime binary
		// TODO: allow this to be configured if necessary
		this.#runtimeConstructor = getSupportedRuntime();
		// TODO: use logger
		const desc = this.#runtimeConstructor.description;
		console.log(
			grey(`Running the 🦄 Cloudflare Workers Runtime 🦄 ${desc}...`)
		);

		this.#disposeController = new AbortController();
		this.#initPromise = this.#init();
	}

	#initPlugins() {
		for (const [key, plugin] of PLUGIN_ENTRIES) {
			if (plugin.gateway !== undefined && plugin.router !== undefined) {
				const gatewayFactory = new GatewayFactory<any>(key, plugin.gateway);
				const router = new plugin.router(gatewayFactory);
				// @ts-expect-error this.#gatewayFactories[key] could be any plugin's
				this.#gatewayFactories[key] = gatewayFactory;
				// @ts-expect-error this.#routers[key] could be any plugin's
				this.#routers[key] = router;
			}
		}
	}

	async #init() {
		// Start loopback server (how the runtime accesses with Miniflare's storage)
		this.#loopbackServer = await this.#startLoopbackServer(0, "127.0.0.1");
		const address = this.#loopbackServer.address();
		// Note address would be string with unix socket
		assert(address !== null && typeof address === "object");
		// noinspection JSObjectNullOrUndefined
		const loopbackPort = address.port;

		// Start runtime
		const entryPort =
			this.#sharedOpts.core.port ?? (await getPort({ port: 8787 }));
		// TODO: respect entry `host` option
		// TODO: download/cache from GitHub releases or something, or include in pkg?
		this.#runtime = new this.#runtimeConstructor(
			RUNTIME_PATH,
			entryPort,
			loopbackPort
		);
		this.#runtimeEntryURL = new URL(`http://127.0.0.1:${entryPort}`);

		const config = await this.#initialConfigPromise;
		assert(config !== undefined);
		this.#initialConfigPromise = undefined;
		const configBuffer = serializeConfig(config);
		await this.#runtime.updateConfig(configBuffer);

		// Wait for runtime to start
		await this.#waitForRuntime();
		console.log(bold(green(`Ready on ${this.#runtimeEntryURL}! 🎉`)));
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
		});

		console.log(request.method, req.url);
		console.log(await request.clone().text());

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

	#startLoopbackServer(
		port: string | number,
		hostname?: string
	): Promise<StoppableServer> {
		return new Promise((resolve) => {
			const server = stoppable(http.createServer(this.#handleLoopback));
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
		await waitForRequest(this.#runtimeEntryURL!, {
			headers: { [HEADER_PROBE]: this.#optionsVersion.toString() },
			signal: this.#disposeController.signal,
		});
	}

	async #assembleConfig(): Promise<Config> {
		// Copy options in case `setOptions` called whilst assembling config
		const optionsVersion = this.#optionsVersion;
		const allWorkerOpts = this.#workerOpts;
		const sharedOpts = this.#sharedOpts;

		const services: Service[] = [];
		const sockets: Socket[] = [
			{ name: SOCKET_ENTRY, http: {}, service: { name: SERVICE_ENTRY } },
		];

		// Dedupe services by name
		const serviceNames = new Set<string>();

		for (let i = 0; i < allWorkerOpts.length; i++) {
			const workerOpts = allWorkerOpts[i];
			// Collect all bindings from this worker
			const workerBindings: Worker_Binding[] = [];
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginBindings = await plugin.getBindings(workerOpts[key]);
				if (pluginBindings !== undefined) {
					workerBindings.push(...pluginBindings);
				}
			}

			// Collect all services required by this worker
			for (const [key, plugin] of PLUGIN_ENTRIES) {
				const pluginServices = await plugin.getServices({
					options: workerOpts[key],
					optionsVersion,
					sharedOptions: sharedOpts[key],
					workerBindings,
					workerIndex: i,
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

		const config: Config = { services, sockets };
		// const inspectedConfig = util.inspect(config, {
		//   depth: null,
		//   colors: true,
		//   maxStringLength: 50,
		// });
		// console.log(grey("Assembled config:"), dim(inspectedConfig));

		return config;
	}

	get ready() {
		return this.#initPromise;
	}

	#checkDisposed() {
		if (this.#disposeController.signal.aborted) {
			throw new MiniflareError("ERR_DISPOSED", "Cannot use disposed instance");
		}
	}

	async setOptions(opts: MiniflareOptions) {
		this.#checkDisposed();

		const updatePromise = new DeferredPromise<void>();
		this.#updatePromise = updatePromise;

		// Wait for initial initialisation before changing options
		await this.#initPromise;

		// Split and validate options
		// TODO: merge with previous config
		const [sharedOpts, workerOpts] = validateOptions(opts);
		// Increment version, so we know when runtime has processed updates
		this.#optionsVersion++;
		this.#sharedOpts = sharedOpts;
		this.#workerOpts = workerOpts;

		// Assemble and serialize config
		const currentOptionsVersion = this.#optionsVersion;
		const config = await this.#assembleConfig();
		// If `setOptions` called again, discard our now outdated config
		if (currentOptionsVersion !== this.#optionsVersion) return;
		const configBuffer = serializeConfig(config);

		// Send to runtime and wait for updates to process
		assert(this.#runtime !== undefined);
		await this.#runtime.updateConfig(configBuffer);
		await this.#waitForRuntime();
		updatePromise.resolve();

		console.log(
			bold(green(`Updated and ready on ${this.#runtimeEntryURL}! 🎉`))
		);
	}

	async dispose() {
		this.#disposeController.abort();
		await this.#initPromise;
		await this.#updatePromise;
		this.#runtime?.dispose();
		await this.#stopLoopbackServer();
	}
}

export * from "./helpers";
export * from "./plugins";
export * from "./runtime";
export * from "./storage";
