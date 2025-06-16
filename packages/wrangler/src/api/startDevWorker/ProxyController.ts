import assert from "node:assert";
import { randomUUID } from "node:crypto";
import events from "node:events";
import path from "node:path";
import { LogLevel, Miniflare, Mutex, Response } from "miniflare";
import inspectorProxyWorkerPath from "worker:startDevWorker/InspectorProxyWorker";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import WebSocket from "ws";
import {
	logConsoleMessage,
	maybeHandleNetworkLoadResource,
} from "../../dev/inspect";
import {
	castLogLevel,
	handleRuntimeStdio,
	WranglerLog,
} from "../../dev/miniflare";
import { getHttpsOptions } from "../../https-options";
import { logger } from "../../logger";
import { getSourceMappedStack } from "../../sourcemap";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { assertNever, createDeferred } from "./utils";
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
import type { DeferredPromise } from "./utils";
import type { MiniflareOptions } from "miniflare";

type ProxyControllerEventMap = ControllerEventMap & {
	ready: [ReadyEvent];
	previewTokenExpired: [PreviewTokenExpiredEvent];
};
export class ProxyController extends Controller<ProxyControllerEventMap> {
	public ready = createDeferred<ReadyEvent>();

	public proxyWorker?: Miniflare;
	proxyWorkerOptions?: MiniflareOptions;
	private inspectorProxyWorkerWebSocket?: DeferredPromise<WebSocket>;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: EsbuildBundle;

	secret = randomUUID();

	protected createProxyWorker() {
		if (this._torndown) {
			return;
		}
		assert(this.latestConfig !== undefined);

		const cert =
			this.latestConfig.dev?.server?.secure ||
			(this.latestConfig.dev.inspector !== false &&
				this.latestConfig.dev?.inspector?.secure)
				? getHttpsOptions(
						this.latestConfig.dev.server?.httpsKeyPath,
						this.latestConfig.dev.server?.httpsCertPath
					)
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
					compatibilityDate: "2023-12-18",
					compatibilityFlags: ["nodejs_compat"],
					modulesRoot: path.dirname(proxyWorkerPath),
					modules: [{ type: "ESModule", path: proxyWorkerPath }],
					durableObjects: {
						DURABLE_OBJECT: {
							className: "ProxyWorker",
							unsafePreventEviction: true,
						},
					},
					// Miniflare will strip CF-Connecting-IP from outgoing fetches from a Worker (to fix https://github.com/cloudflare/workers-sdk/issues/7924)
					// However, the proxy worker only makes outgoing requests to the user Worker Miniflare instance, which _should_ receive CF-Connecting-IP
					stripCfConnectingIp: false,
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
			],

			verbose: logger.loggerLevel === "debug",

			// log requests into the ProxyWorker (for local + remote mode)
			log: new ProxyControllerLogger(castLogLevel(logger.loggerLevel), {
				prefix:
					// if debugging, log requests with specic ProxyWorker prefix
					logger.loggerLevel === "debug" ? "wrangler-ProxyWorker" : "wrangler",
			}),
			handleRuntimeStdio,
			liveReload: false,
		};

		if (this.latestConfig.dev.inspector !== false) {
			proxyWorkerOptions.workers.push({
				name: "InspectorProxyWorker",
				compatibilityDate: "2023-12-18",
				compatibilityFlags: [
					"nodejs_compat",
					"increase_websocket_message_size",
				],
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

				unsafeDirectSockets: [
					{
						host: this.latestConfig.dev?.inspector?.hostname,
						port: this.latestConfig.dev?.inspector?.port ?? 0,
					},
				],
				// no need to use file-system, so don't
				cache: false,
				unsafeEphemeralDurableObjects: true,
			});
		}

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

			void this.proxyWorker.setOptions(proxyWorkerOptions).catch((error) => {
				this.emitErrorEvent("Failed to start ProxyWorker", error);
			});

			// this creates a new .ready promise that will be resolved when both ProxyWorkers are ready
			// it also respects any await-ers of the existing .ready promise
			this.ready = createDeferred<ReadyEvent>(this.ready);
		}

		// store the non-null versions for callbacks
		const { proxyWorker } = this;

		if (willInstantiateMiniflareInstance) {
			void Promise.all([
				proxyWorker.ready,
				this.latestConfig.dev.inspector === false
					? Promise.resolve(undefined)
					: proxyWorker.unsafeGetDirectURL("InspectorProxyWorker"),
			])
				.then(([url, inspectorUrl]) => {
					if (!inspectorUrl) {
						return [url, undefined];
					}
					// Don't connect the inspector proxy worker until we have a valid ready Miniflare instance.
					// Otherwise, tearing down the ProxyController immediately after setting it up
					// will result in proxyWorker.ready throwing, but reconnectInspectorProxyWorker hanging for ever,
					// preventing teardown
					return this.reconnectInspectorProxyWorker().then(() => [
						url,
						inspectorUrl,
					]);
				})
				.then(([url, inspectorUrl]) => {
					assert(url);
					this.emitReadyEvent(proxyWorker, url, inspectorUrl);
				})
				.catch((error) => {
					if (this._torndown) {
						return;
					}
					this.emitErrorEvent(
						"Failed to start ProxyWorker or InspectorProxyWorker",
						error
					);
				});
		}
	}

	private async reconnectInspectorProxyWorker(): Promise<
		WebSocket | undefined
	> {
		if (this._torndown) {
			return;
		}

		assert(
			this.latestConfig?.dev.inspector !== false,
			"Trying to reconnect with inspector proxy worker when inspector is disabled"
		);

		const existingWebSocket = await this.inspectorProxyWorkerWebSocket?.promise;
		if (existingWebSocket?.readyState === WebSocket.OPEN) {
			return existingWebSocket;
		}

		this.inspectorProxyWorkerWebSocket = createDeferred<WebSocket>();

		let webSocket: WebSocket | null = null;

		try {
			assert(this.proxyWorker);

			const inspectorProxyWorkerUrl = await this.proxyWorker.unsafeGetDirectURL(
				"InspectorProxyWorker"
			);
			webSocket = new WebSocket(
				`${inspectorProxyWorkerUrl.href}/cdn-cgi/InspectorProxyWorker/websocket`,
				{
					headers: { Authorization: this.secret },
				}
			);
		} catch (cause) {
			if (this._torndown) {
				return;
			}

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
			if (this._torndown) {
				return;
			}

			if (this.latestConfig?.dev.inspector !== false) {
				void this.reconnectInspectorProxyWorker();
			}
		});

		await events.once(webSocket, "open");

		this.inspectorProxyWorkerWebSocket?.resolve(webSocket);

		return webSocket;
	}

	runtimeMessageMutex = new Mutex();
	async sendMessageToProxyWorker(
		message: ProxyWorkerIncomingRequestBody,
		retries = 3
	): Promise<void> {
		if (this._torndown) {
			return;
		}

		// Don't do any async work here. Enqueue the message with the mutex immediately.

		try {
			await this.runtimeMessageMutex.runWith(async () => {
				const { proxyWorker } = await this.ready.promise;

				const ready = await proxyWorker.ready.catch(() => undefined);
				if (!ready) {
					return;
				}

				return proxyWorker.dispatchFetch(
					`http://dummy/cdn-cgi/ProxyWorker/${message.type}`,
					{
						headers: { Authorization: this.secret },
						cf: { hostMetadata: message },
					}
				);
			});
		} catch (cause) {
			if (this._torndown) {
				return;
			}

			const error = castErrorCause(cause);

			if (retries > 0) {
				return this.sendMessageToProxyWorker(message, retries - 1);
			}

			this.emitErrorEvent(
				`Failed to send message to ProxyWorker: ${JSON.stringify(message)}`,
				error
			);
		}
	}
	async sendMessageToInspectorProxyWorker(
		message: InspectorProxyWorkerIncomingWebSocketMessage,
		retries = 3
	): Promise<void> {
		if (this._torndown) {
			return;
		}

		assert(
			this.latestConfig?.dev.inspector !== false,
			"Trying to send message to inspector proxy worker when inspector is disabled"
		);

		try {
			// returns the existing websocket, if already connected
			const websocket = await this.reconnectInspectorProxyWorker();
			assert(websocket);

			websocket.send(JSON.stringify(message));
		} catch (cause) {
			if (this._torndown) {
				return;
			}

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
		if (this.latestConfig.dev.inspector !== false) {
			void this.sendMessageToInspectorProxyWorker({ type: "reloadStart" });
		}
	}
	onReloadComplete(data: ReloadCompleteEvent) {
		this.latestConfig = data.config;
		this.latestBundle = data.bundle;

		void this.sendMessageToProxyWorker({
			type: "play",
			proxyData: data.proxyData,
		});

		if (this.latestConfig.dev.inspector !== false) {
			void this.sendMessageToInspectorProxyWorker({
				type: "reloadComplete",
				proxyData: data.proxyData,
			});
		}
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
		assert(
			this.latestConfig?.dev.inspector !== false,
			"Trying to handle inspector message when inspector is disabled"
		);

		switch (message.method) {
			case "Runtime.consoleAPICalled": {
				if (this._torndown) {
					return;
				}

				logConsoleMessage(message.params);

				break;
			}
			case "Runtime.exceptionThrown": {
				if (this._torndown) {
					return;
				}

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
		assert(
			this.latestConfig?.dev.inspector !== false,
			"Trying to handle inspector request when inspector is disabled"
		);

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
				if (this._torndown) {
					break;
				}

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
		logger.debug("ProxyController teardown beginning...");
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

		logger.debug("ProxyController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReadyEvent(
		proxyWorker: Miniflare,
		url: URL,
		inspectorUrl: URL | undefined
	) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
			url,
			inspectorUrl,
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

class ProxyControllerLogger extends WranglerLog {
	log(message: string) {
		// filter out request logs being handled by the ProxyWorker
		// the requests log remaining are handled by the UserWorker
		// keep the ProxyWorker request logs if we're in debug mode
		if (message.includes("/cdn-cgi/") && this.level < LogLevel.DEBUG) {
			return;
		}
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
	if (prev === undefined) {
		return false;
	} // first time, so 'no change'

	// otherwise, if they're not deeply equal, they've changed
	return !deepEquality(prev, next);
}
