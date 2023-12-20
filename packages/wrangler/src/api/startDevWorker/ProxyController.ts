import assert from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { LogLevel, Miniflare, Mutex, Response, WebSocket } from "miniflare";
import inspectorProxyWorkerPath from "worker:startDevWorker/InspectorProxyWorker";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import {
	logConsoleMessage,
	maybeHandleNetworkLoadResource,
} from "../../dev/inspect";
import { WranglerLog, castLogLevel } from "../../dev/miniflare";
import { handleRuntimeStdio } from "../../dev/miniflare";
import { getHttpsOptions } from "../../https-options";
import { logger } from "../../logger";
import { getSourceMappedStack } from "../../sourcemap";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { assertNever, createDeferred, type DeferredPromise } from "./utils";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { ControllerEventMap } from "./BaseController";
import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	ErrorEvent,
	InspectorProxyWorkerIncomingWebSocketMessage,
	InspectorProxyWorkerOutgoingRequestBody,
	InspectorProxyWorkerOutgoingWebsocketMessage,
	PreviewTokenExpiredEvent,
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	SerializedError,
} from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { MiniflareOptions } from "miniflare";

export type ProxyControllerEventMap = ControllerEventMap & {
	ready: [ReadyEvent];
	previewTokenExpired: [PreviewTokenExpiredEvent];
};
export class ProxyController extends Controller<ProxyControllerEventMap> {
	public ready = createDeferred<ReadyEvent>();

	public proxyWorker?: Miniflare;
	proxyWorkerOptions?: MiniflareOptions;
	inspectorProxyWorkerWebSocket?: DeferredPromise<WebSocket>;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: EsbuildBundle;
	secret = randomUUID();

	protected createProxyWorker() {
		if (this._torndown) return;
		assert(this.latestConfig !== undefined);

		const cert =
			this.latestConfig.dev?.server?.secure ||
			this.latestConfig.dev?.inspector?.secure
				? getHttpsOptions()
				: undefined;

		const proxyWorkerOptions: MiniflareOptions = {
			host: this.latestConfig.dev?.server?.hostname,
			port: this.latestConfig.dev?.server?.port,
			https: this.latestConfig.dev?.server?.secure,
			httpsCert: cert?.cert,
			httpsKey: cert?.key,

			workers: [
				{
					name: "ProxyWorker",
					compatibilityFlags: ["nodejs_compat"],
					modulesRoot: path.dirname(proxyWorkerPath),
					modules: [{ type: "ESModule", path: proxyWorkerPath }],
					durableObjects: {
						DURABLE_OBJECT: {
							className: "ProxyWorker",
							unsafePreventEviction: true,
						},
					},
					serviceBindings: {
						PROXY_CONTROLLER: async (req): Promise<Response> => {
							const message =
								(await req.json()) as ProxyWorkerOutgoingRequestBody;

							this.onProxyWorkerMessage(message);

							return new Response(null, { status: 204 });
						},
					},
					bindings: {
						PROXY_CONTROLLER_AUTH_SECRET: this.secret,
					},

					// no need to use file-system, so don't
					cache: false,
					unsafeEphemeralDurableObjects: true,
				},
				{
					name: "InspectorProxyWorker",
					compatibilityFlags: ["nodejs_compat"],
					modulesRoot: path.dirname(inspectorProxyWorkerPath),
					modules: [{ type: "ESModule", path: inspectorProxyWorkerPath }],
					durableObjects: {
						DURABLE_OBJECT: {
							className: "InspectorProxyWorker",
							unsafePreventEviction: true,
						},
					},
					serviceBindings: {
						PROXY_CONTROLLER: async (req): Promise<Response> => {
							const body =
								(await req.json()) as InspectorProxyWorkerOutgoingRequestBody;

							return this.onInspectorProxyWorkerRequest(body);
						},
					},
					bindings: {
						PROXY_CONTROLLER_AUTH_SECRET: this.secret,
					},

					unsafeDirectHost: this.latestConfig.dev?.inspector?.hostname,
					unsafeDirectPort: this.latestConfig.dev?.inspector?.port ?? 0,

					// no need to use file-system, so don't
					cache: false,
					unsafeEphemeralDurableObjects: true,
				},
			],

			verbose: logger.loggerLevel === "debug",

			// log requests into the ProxyWorker (for local + remote mode)
			log: new ProxyControllerLogger(castLogLevel(logger.loggerLevel), {
				prefix:
					// if debugging, log requests with specic ProxyWorker prefix
					logger.loggerLevel === "debug" ? "wrangler-ProxyWorker" : "wrangler",
			}),
			handleRuntimeStdio,
		};

		const proxyWorkerOptionsChanged = didMiniflareOptionsChange(
			this.proxyWorkerOptions,
			proxyWorkerOptions
		);

		const willInstantiateMiniflareInstance =
			!this.proxyWorker || proxyWorkerOptionsChanged;
		this.proxyWorker ??= new Miniflare(proxyWorkerOptions);
		this.proxyWorkerOptions = proxyWorkerOptions;

		if (proxyWorkerOptionsChanged) {
			logger.debug("ProxyWorker miniflare options changed, reinstantiating...");

			void this.proxyWorker.setOptions(proxyWorkerOptions);

			// this creates a new .ready promise that will be resolved when both ProxyWorkers are ready
			// it also respects any await-ers of the existing .ready promise
			this.ready = createDeferred<ReadyEvent>(this.ready);
		}

		// store the non-null versions for callbacks
		const { proxyWorker } = this;

		if (willInstantiateMiniflareInstance) {
			void Promise.all([
				proxyWorker.ready,
				this.reconnectInspectorProxyWorker(),
			])
				.then(() => {
					this.emitReadyEvent(proxyWorker);
				})
				.catch((error) => {
					this.emitErrorEvent(
						"Failed to start ProxyWorker or InspectorProxyWorker",
						error
					);
				});
		}
	}

	async reconnectInspectorProxyWorker(): Promise<WebSocket | undefined> {
		if (this._torndown) return;

		const existingWebSocket = await this.inspectorProxyWorkerWebSocket?.promise;
		if (existingWebSocket?.readyState === WebSocket.READY_STATE_OPEN) {
			return existingWebSocket;
		}

		this.inspectorProxyWorkerWebSocket = createDeferred<WebSocket>();

		let webSocket: WebSocket | null = null;

		try {
			assert(this.proxyWorker);
			const inspectorProxyWorker = await this.proxyWorker.getWorker(
				"InspectorProxyWorker"
			);
			({ webSocket } = await inspectorProxyWorker.fetch(
				"http://dummy/cdn-cgi/InspectorProxyWorker/websocket",
				{
					headers: { Authorization: this.secret, Upgrade: "websocket" },
				}
			));
		} catch (cause) {
			if (this._torndown) return;

			const error = castErrorCause(cause);

			this.inspectorProxyWorkerWebSocket?.reject(error);
			this.emitErrorEvent("Could not connect to InspectorProxyWorker", error);
			return;
		}

		assert(
			webSocket,
			"Expected webSocket on response from inspectorProxyWorker"
		);

		webSocket.addEventListener("message", (event) => {
			assert(typeof event.data === "string");

			this.onInspectorProxyWorkerMessage(JSON.parse(event.data));
		});
		webSocket.addEventListener("close", () => {
			// don't reconnect
		});
		webSocket.addEventListener("error", () => {
			if (this._torndown) return;

			void this.reconnectInspectorProxyWorker();
		});

		webSocket.accept();
		this.inspectorProxyWorkerWebSocket?.resolve(webSocket);

		return webSocket;
	}

	runtimeMessageMutex = new Mutex();
	async sendMessageToProxyWorker(
		message: ProxyWorkerIncomingRequestBody,
		retries = 3
	): Promise<void> {
		if (this._torndown) return;

		// Don't do any async work here. Enqueue the message with the mutex immediately.

		try {
			await this.runtimeMessageMutex.runWith(async () => {
				assert(this.proxyWorker, "proxyWorker should already be instantiated");

				const ready = await this.proxyWorker.ready.catch(() => undefined);
				if (!ready) return;

				return this.proxyWorker.dispatchFetch(
					`http://dummy/cdn-cgi/ProxyWorker/${message.type}`,
					{
						headers: { Authorization: this.secret },
						cf: { hostMetadata: message },
					}
				);
			});
		} catch (cause) {
			if (this._torndown) return;

			const error = castErrorCause(cause);

			if (retries > 0) {
				return this.sendMessageToProxyWorker(message, retries - 1);
			}

			this.emitErrorEvent(
				`Failed to send message to ProxyWorker: ${JSON.stringify(message)}`,
				error
			);

			throw error;
		}
	}
	async sendMessageToInspectorProxyWorker(
		message: InspectorProxyWorkerIncomingWebSocketMessage,
		retries = 3
	): Promise<void> {
		if (this._torndown) return;

		try {
			// returns the existing websocket, if already connected
			const websocket = await this.reconnectInspectorProxyWorker();
			assert(websocket);

			websocket.send(JSON.stringify(message));
		} catch (cause) {
			if (this._torndown) return;

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
		this.latestConfig = data.config;
		this.createProxyWorker();

		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onBundleStart(data: BundleStartEvent) {
		this.latestConfig = data.config;

		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onReloadStart(data: ReloadStartEvent) {
		this.latestConfig = data.config;

		void this.sendMessageToProxyWorker({ type: "pause" });
		void this.sendMessageToInspectorProxyWorker({ type: "reloadStart" });
	}
	onReloadComplete(data: ReloadCompleteEvent) {
		this.latestConfig = data.config;
		this.latestBundle = data.bundle; // TODO(now): update `latestBundle` type

		void this.sendMessageToProxyWorker({
			type: "play",
			proxyData: data.proxyData,
		});

		void this.sendMessageToInspectorProxyWorker({
			type: "reloadComplete",
			proxyData: data.proxyData,
		});
	}
	onProxyWorkerMessage(message: ProxyWorkerOutgoingRequestBody) {
		switch (message.type) {
			case "previewTokenExpired":
				this.emitPreviewTokenExpiredEvent(message.proxyData);

				break;
			case "error":
				this.emitErrorEvent("Error inside ProxyWorker", message.error);

				break;
			case "debug-log":
				logger.debug("[ProxyWorker]", ...message.args);

				break;
			default:
				assertNever(message);
		}
	}
	onInspectorProxyWorkerMessage(
		message: InspectorProxyWorkerOutgoingWebsocketMessage
	) {
		switch (message.method) {
			case "Runtime.consoleAPICalled": {
				if (this._torndown) return;

				logConsoleMessage(message.params);

				break;
			}
			case "Runtime.exceptionThrown": {
				if (this._torndown) return;

				const stack = getSourceMappedStack(message.params.exceptionDetails);
				logger.error(message.params.exceptionDetails.text, stack);
				break;
			}
			default: {
				assertNever(message);
			}
		}
	}
	async onInspectorProxyWorkerRequest(
		message: InspectorProxyWorkerOutgoingRequestBody
	) {
		switch (message.type) {
			case "runtime-websocket-error":
				// TODO: consider sending proxyData again to trigger the InspectorProxyWorker to reconnect to the runtime
				logger.debug(
					"[InspectorProxyWorker] 'runtime websocket' error",
					message.error
				);

				break;
			case "error":
				this.emitErrorEvent("Error inside InspectorProxyWorker", message.error);

				break;
			case "debug-log":
				if (this._torndown) break;

				logger.debug("[InspectorProxyWorker]", ...message.args);

				break;
			case "load-network-resource": {
				assert(this.latestConfig !== undefined);
				assert(this.latestBundle !== undefined);

				let maybeContents: string | undefined;
				if (message.url.startsWith("wrangler-file:")) {
					maybeContents = maybeHandleNetworkLoadResource(
						message.url.replace("wrangler-file:", "file:"),
						this.latestBundle,
						this.latestBundle.sourceMapMetadata?.tmpDir
					);
				}

				if (maybeContents === undefined) {
					return new Response(null, { status: 404 });
				}

				return new Response(maybeContents);
			}
			default:
				assertNever(message);
				return new Response(null, { status: 404 });
		}

		return new Response(null, { status: 204 });
	}

	_torndown = false;
	async teardown() {
		logger.debug("ProxyController teardown");
		this._torndown = true;

		const { proxyWorker } = this;
		this.proxyWorker = undefined;

		await Promise.all([
			proxyWorker?.dispose(),
			this.inspectorProxyWorkerWebSocket?.promise
				.then((ws) => ws.close())
				.catch(() => {
					/* ignore */
				}),
		]);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReadyEvent(proxyWorker: Miniflare) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
		};

		this.emit("ready", data);
		this.ready.resolve(data);
	}
	emitPreviewTokenExpiredEvent(proxyData: ProxyData) {
		this.emit("previewTokenExpired", {
			type: "previewTokenExpired",
			proxyData,
		});
	}

	emitErrorEvent(data: ErrorEvent): void;
	emitErrorEvent(reason: string, cause?: Error | SerializedError): void;
	emitErrorEvent(data: string | ErrorEvent, cause?: Error | SerializedError) {
		if (typeof data === "string") {
			data = {
				type: "error",
				source: "ProxyController",
				cause: castErrorCause(cause),
				reason: data,
				data: {
					config: this.latestConfig,
					bundle: this.latestBundle,
				},
			};
		}
		super.emitErrorEvent(data);
	}
}

export class ProxyControllerLogger extends WranglerLog {
	log(message: string) {
		// filter out request logs being handled by the ProxyWorker
		// the requests log remaining are handled by the UserWorker
		// keep the ProxyWorker request logs if we're in debug mode
		if (message.includes("/cdn-cgi/") && this.level < LogLevel.DEBUG) return;
		super.log(message);
	}
}

function deepEquality(a: unknown, b: unknown): boolean {
	// could be more efficient, but this is fine for now
	return JSON.stringify(a) === JSON.stringify(b);
}

function didMiniflareOptionsChange(
	prev: MiniflareOptions | undefined,
	next: MiniflareOptions
) {
	if (prev === undefined) return false; // first time, so 'no change'

	// otherwise, if they're not deeply equal, they've changed
	return !deepEquality(prev, next);
}
