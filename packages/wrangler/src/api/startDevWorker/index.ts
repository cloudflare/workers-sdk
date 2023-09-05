import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare, Response } from "miniflare";
// import { readFileSync } from "../../parse";
import { logConsoleMessage } from "../../inspect";
import { getBasePath } from "../../paths";
import { castErrorCause } from "./events";
import { createDeferredPromise } from "./utils";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
	ErrorEvent,
	InspectorProxyWorkerIncomingMessage,
	InspectorProxyWorkerOutgoingMessage,
	PreviewTokenExpiredEvent,
	ProxyWorkerIncomingMessage,
	ProxyWorkerOutgoingMessage,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	TeardownEvent,
} from "./events";
import type { StartDevWorkerOptions, DevWorker } from "./types";
import type { WebSocket } from "miniflare";

export * from "./types";
export * from "./events";

export function startWorker(options: StartDevWorkerOptions): DevWorker {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}

export function createWorkerObject(
	devEnv: DevEnv,
	onNameUpdate: (name: string) => void
): DevWorker {
	return {
		get ready() {
			return devEnv.proxy.ready.then(() => undefined);
		},
		get config() {
			return devEnv.config.config;
		},
		setOptions(options) {
			if (options.name) onNameUpdate(options.name);

			return devEnv.config.setOptions(options);
		},
		updateOptions(options) {
			if (options.name) onNameUpdate(options.name);

			return devEnv.config.updateOptions(options);
		},
		async fetch(...args) {
			const { miniflareProxyWorker } = await devEnv.proxy.ready;

			return miniflareProxyWorker.dispatchFetch(...args);
		},
		async queue(...args) {
			// const { worker } = await devEnv.proxy.ready;
			// return worker.queue(...args);
		},
		async scheduled(...args) {
			// const { worker } = await devEnv.proxy.ready;
			// return worker.scheduled(...args);
		},
		async dispose() {
			await devEnv.teardown({} as TeardownEvent);
		},
	};
}

export class DevEnv extends EventEmitter {
	config: ConfigController;
	bundler: BundlerController;
	runtimes: RuntimeController[];
	proxy: ProxyController;
	workers = new Map<string, DevWorker>();

	startWorker(options: StartDevWorkerOptions): DevWorker {
		const worker = createWorkerObject(this, (newName) => {
			this.workers.delete(options.name);
			this.workers.set(newName, worker);
		});

		this.workers.set(options.name, worker);
		// this.config.setOptions(options);

		return worker;
	}

	constructor({
		config = new ConfigController(),
		bundler = new BundlerController(),
		runtimes = [
			new LocalRuntimeController(),
			new RemoteRuntimeController(),
		] as RuntimeController[],
		proxy = new ProxyController(),
	} = {}) {
		super();

		this.config = config;
		this.bundler = bundler;
		this.runtimes = runtimes;
		this.proxy = proxy;

		[config, bundler, ...runtimes, proxy].forEach((controller) =>
			controller.on("error", (event) => this.emitErrorEvent(event))
		);

		config.on("configUpdate", (event) => {
			bundler.onConfigUpdate(event);
			proxy.onConfigUpdate(event);
		});

		bundler.on("bundleStart", (event) => {
			proxy.onBundleStart(event);
			runtimes.forEach((runtime) => {
				runtime.onBundleStart(event);
			});
		});
		bundler.on("bundleComplete", (event) => {
			runtimes.forEach((runtime) => {
				runtime.onBundleComplete(event);
			});
		});

		runtimes.forEach((runtime) => {
			runtime.on("reloadStart", (event) => {
				proxy.onReloadStart(event);
			});
			runtime.on("reloadComplete", (event) => {
				proxy.onReloadComplete(event);
			});
		});

		proxy.on("previewTokenExpired", (event) => {
			runtimes.forEach((runtime) => {
				runtime.onPreviewTokenExpired(event);
			});
		});
	}

	// *********************
	//   Event Dispatchers
	// *********************

	async teardown(data: TeardownEvent) {
		this.emit("teardown", data);

		await Promise.all([
			this.config.teardown(data),
			this.bundler.teardown(data),
			this.runtimes.forEach((runtime) => runtime.teardown(data)),
			this.proxy.teardown(data),
		]);
	}

	emitErrorEvent(data: ErrorEvent) {
		this.emit("error", data);
	}
}

export class ConfigController extends EventEmitter {
	config?: StartDevWorkerOptions;

	setOptions(_: StartDevWorkerOptions) {
		throwNotImplementedError(this.setOptions.name, this.constructor.name);
	}
	updateOptions(_: Partial<StartDevWorkerOptions>) {
		throwNotImplementedError(this.updateOptions.name, this.constructor.name);
	}

	// ******************
	//   Event Handlers
	// ******************

	async teardown(_: TeardownEvent) {
		throwNotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(data: ConfigUpdateEvent) {
		this.emit("configUpdate", data);
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "configUpdate", listener: (_: ConfigUpdateEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}

export class BundlerController extends EventEmitter {
	// ******************
	//   Event Handlers
	// ******************

	onConfigUpdate(_: ConfigUpdateEvent) {
		throwNotImplementedError(this.onConfigUpdate.name, this.constructor.name);
	}

	async teardown(_: TeardownEvent) {
		throwNotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitBundleStartEvent(data: BundleStartEvent) {
		this.emit("bundleStart", data);
	}
	emitBundleCompletetEvent(data: BundleCompleteEvent) {
		this.emit("bundleComplete", data);
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "bundleStart", listener: (_: BundleStartEvent) => void): this;
	on(event: "bundleComplete", listener: (_: BundleCompleteEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}

export abstract class RuntimeController extends EventEmitter {
	// ******************
	//   Event Handlers
	// ******************

	abstract onBundleStart(_: BundleStartEvent): void;
	abstract onBundleComplete(_: BundleCompleteEvent): void;
	abstract onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void;
	abstract teardown(_: TeardownEvent): Promise<void>;

	// *********************
	//   Event Dispatchers
	// *********************

	abstract emitReloadStartEvent(data: ReloadStartEvent): void;
	abstract emitReloadCompletetEvent(data: ReloadCompleteEvent): void;

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "reloadStart", listener: (_: ReloadStartEvent) => void): this;
	on(event: "reloadComplete", listener: (_: ReloadCompleteEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}
export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		throwNotImplementedError(this.onBundleStart.name, this.constructor.name);
	}
	onBundleComplete(_: BundleCompleteEvent) {
		throwNotImplementedError(this.onBundleComplete.name, this.constructor.name);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// ignore in local runtime
	}

	async teardown(_: TeardownEvent) {
		throwNotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadComplete", data);
	}
	emitReloadCompletetEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
export class RemoteRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		throwNotImplementedError(this.onBundleStart.name, this.constructor.name);
	}
	onBundleComplete(_: BundleCompleteEvent) {
		throwNotImplementedError(this.onBundleComplete.name, this.constructor.name);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		throwNotImplementedError(
			this.onPreviewTokenExpired.name,
			this.constructor.name
		);
	}

	async teardown(_: TeardownEvent) {
		throwNotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadComplete", data);
	}
	emitReloadCompletetEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}

export class ProxyController extends EventEmitter {
	protected readyResolver!: (_: ReadyEvent) => void;
	public ready: Promise<ReadyEvent> = new Promise((resolve) => {
		this.readyResolver = resolve;
	});

	public proxyWorker: Miniflare | undefined;
	public inspectorProxyWorker: Miniflare | undefined;
	public inspectorProxyWorkerWebSocket = createDeferredPromise<WebSocket>();

	secret = randomUUID();

	protected createProxyWorker(config: StartDevWorkerOptions): Miniflare {
		const proxyWorkerResult = esbuild.buildSync({
			entryPoints: [
				path.join(getBasePath(), `templates/startDevWorker/ProxyWorker.ts`),
			],
			bundle: true,
			format: "esm",
			target: "esnext",
			write: false,
			external: ["node:*"],
		});
		const inspectorProxyWorkerResult = esbuild.buildSync({
			entryPoints: [
				path.join(
					getBasePath(),
					`templates/startDevWorker/InspectorProxyWorker.ts`
				),
			],
			bundle: true,
			format: "esm",
			target: "esnext",
			write: false,
			external: ["node:*"],
		});

		this.proxyWorker ??= new Miniflare({
			verbose: true,
			compatibilityFlags: ["nodejs_compat"],
			modules: [
				{
					type: "ESModule",
					contents: proxyWorkerResult.outputFiles[0].contents,
					path: proxyWorkerResult.outputFiles[0].path,
				},
			],
			durableObjects: {
				DURABLE_OBJECT: "ProxyWorker",
			},
			serviceBindings: {
				PROXY_CONTROLLER: async (req): Promise<Response> => {
					const message = (await req.json()) as ProxyWorkerOutgoingMessage;

					this.onProxyWorkerMessage(message);

					return new Response(null, { status: 204 });
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// TODO(soon): use Wrangler's self-signed cert creation instead
			https: config.dev?.server?.secure,
			host: config.dev?.server?.hostname,
			port: config.dev?.server?.port, // random port if undefined
		});

		// separate Miniflare instance while it only permits opening one port
		this.inspectorProxyWorker ??= new Miniflare({
			verbose: true,
			compatibilityFlags: ["nodejs_compat"],
			modules: [
				{
					type: "ESModule",
					contents: inspectorProxyWorkerResult.outputFiles[0].contents,
					path: inspectorProxyWorkerResult.outputFiles[0].path,
				},
			],
			durableObjects: {
				DURABLE_OBJECT: "InspectorProxyWorker",
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// TODO(soon): use Wrangler's self-signed cert creation instead
			https: config.dev?.inspector?.secure,
			host: config.dev?.inspector?.hostname,
			port: config.dev?.inspector?.port, // random port if undefined
		});

		void Promise.all([
			this.proxyWorker.ready,
			this.inspectorProxyWorker
				.dispatchFetch("http://dummy/", {
					headers: { Authorization: this.secret, Upgrade: "websocket" },
				})
				.then(({ webSocket }) => {
					assert(
						webSocket,
						"Expected webSocket on response from inspectorProxyWorker"
					);

					webSocket.addEventListener("message", (event) => {
						assert(typeof event.data === "string");
						this.onInspectorProxyWorkerMessage(JSON.parse(event.data));
					});

					webSocket.accept();
					this.inspectorProxyWorkerWebSocket.resolve(webSocket);
					// TODO: handle close and error events
				}),
		]).then(([proxyUrl]) => {
			this.emitReadyEvent();
			console.log({ proxyUrl });
		});

		return this.proxyWorker;
	}

	async sendMessageToProxyWorker(
		message: ProxyWorkerIncomingMessage,
		retries = 3
	) {
		try {
			assert(this.proxyWorker);

			console.log(
				`BEFORE Send message to ProxyWorker: ${JSON.stringify(message)}`
			);

			await this.proxyWorker.dispatchFetch("http://dummy/", {
				headers: { Authorization: this.secret },
				cf: { hostMetadata: message },
			});

			console.log(
				`AFTER Send message to ProxyWorker: ${JSON.stringify(message)}`
			);
		} catch (cause) {
			const error = castErrorCause(cause);

			if (retries > 0) {
				await this.sendMessageToProxyWorker(message, retries - 1);
			}

			this.emitErrorEvent(
				`Failed to send message to ProxyWorker: ${JSON.stringify(message)}`,
				error
			);

			throw error;
		}
	}
	async sendMessageToInspectorProxyWorker(
		message: InspectorProxyWorkerIncomingMessage,
		retries = 3
	): Promise<void> {
		try {
			const websocket = await this.inspectorProxyWorkerWebSocket;
			assert(websocket);

			console.log(
				`BEFORE Send message to InspectorProxyWorker: ${JSON.stringify(
					message
				)}`
			);

			websocket.send(JSON.stringify(message));

			console.log(
				`AFTER Send message to InspectorProxyWorker: ${JSON.stringify(message)}`
			);
		} catch (cause) {
			const error = castErrorCause(cause);

			if (retries > 0) {
				return this.sendMessageToInspectorProxyWorker(message, retries - 1);
			}

			this.emitErrorEvent(
				`Failed to send message to InspectorProxyWorker: ${JSON.stringify(
					message
				)}`,
				error
			);

			throw error;
		}
	}

	// ******************
	//   Event Handlers
	// ******************

	onConfigUpdate(data: ConfigUpdateEvent) {
		// TODO: handle config.port and config.inspectorPort changes for ProxyWorker and InspectorProxyWorker

		this.createProxyWorker(data.config);

		// void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onBundleStart(_: BundleStartEvent) {
		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onReloadStart(_: ReloadStartEvent) {
		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onReloadComplete(data: ReloadCompleteEvent) {
		void this.sendMessageToProxyWorker({
			type: "play",
			proxyData: data.proxyData,
		});
		void this.sendMessageToInspectorProxyWorker({
			type: "proxy-data",
			proxyData: data.proxyData,
		});
	}
	onProxyWorkerMessage(message: ProxyWorkerOutgoingMessage) {
		switch (message.type) {
			case "previewTokenExpired":
				this.emitPreviewTokenExpiredEvent(message);
				break;

			case "error":
				this.emitErrorEvent("Error inside ProxyWorker", message.error);
				break;
		}
	}
	onInspectorProxyWorkerMessage(message: InspectorProxyWorkerOutgoingMessage) {
		if ("type" in message) {
			// TODO handle error
		} else if (message.method === "Runtime.consoleAPICalled") {
			logConsoleMessage(message.params);
		} else if (message.method === "Runtime.exceptionThrown") {
			// TODO: handle message
		}
	}

	async teardown(_: TeardownEvent) {
		console.log("teardown");

		const { proxyWorker, inspectorProxyWorker } = this;
		this.proxyWorker = undefined;
		this.inspectorProxyWorker = undefined;

		try {
			await proxyWorker?.ready;
			await proxyWorker?.dispose(); // TODO: miniflare should await .ready
		} finally {
			await inspectorProxyWorker?.ready;
			await inspectorProxyWorker?.dispose();
		}
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReadyEvent() {
		const data = {
			type: "ready",
			miniflareProxyWorker: this.proxyWorker!,
		} as const;
		this.emit("ready", data);
		this.readyResolver(data);
	}
	emitPreviewTokenExpiredEvent(data: PreviewTokenExpiredEvent) {
		this.emit("previewTokenExpired", data);
	}
	emitErrorEvent(reason: string, cause?: Error) {
		this.emit("error", { source: "ProxyController", cause, reason });
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "ready", listener: (_: ReadyEvent) => void): this;
	on(
		event: "previewTokenExpired",
		listener: (_: PreviewTokenExpiredEvent) => void
	): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}

class NotImplementedError extends Error {
	constructor(func: string, namespace?: string) {
		if (namespace) func = `${namespace}#${func}`;
		super(`Not Implemented Error: ${func}`);
	}
}

function throwNotImplementedError(func: string, namespace?: string) {
	// throw new NotImplementedError(func, namespace);
	if (namespace) func = `${namespace}#${func}`;
	console.warn(`Not Implemented Error: ${func}`);
}
