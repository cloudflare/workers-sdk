/**
 * TODO:
 *  - build (Inspector)ProxyWorker.ts ahead of time
 *  - handle remote runtime errors (without crashing?!)
 *  - ~~enable request logging for ProxyWorker~~
 *  - disable request logging for User Worker
 *  - ~~add address binding output on initial Proxy Worker creation~~
 *  - hide proxyworker-internal requests by adding well-known pathnxame and filtering in Log subclass (see WranglerLog extends Log)
 */

import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { LogLevel, Miniflare, Response } from "miniflare";
// import { readFileSync } from "../../parse";
import { WebSocket } from "miniflare";
import inspectorProxyWorkerPath from "worker:startDevWorker/InspectorProxyWorker";
import proxyWorkerPath from "worker:startDevWorker/ProxyWorker";
import { WranglerLog, castLogLevel } from "../../dev/miniflare";
import { getHttpsOptions } from "../../https-options";
import {
	getSourceMap,
	logConsoleMessage,
	logUserWorkerException,
} from "../../inspect";
import { logger } from "../../logger";
import { castErrorCause } from "./events";
import {
	assertNever,
	createDeferredPromise,
	type DeferredPromise,
} from "./utils";
import type { EsbuildBundle } from "../../dev/use-esbuild";
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

export class ProxyController extends EventEmitter {
	public ready = createDeferredPromise<ReadyEvent>();

	public proxyWorker?: Miniflare;
	public inspectorProxyWorker?: Miniflare;
	proxyWorkerOptions?: MiniflareOptions;
	inspectorProxyWorkerOptions?: MiniflareOptions;
	inspectorProxyWorkerWebSocket?: DeferredPromise<WebSocket>;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: EsbuildBundle;
	secret = randomUUID();

	protected createProxyWorker(): Miniflare {
		assert(this.latestConfig !== undefined);

		const cert =
			this.latestConfig.dev?.server?.secure ||
			this.latestConfig.dev?.inspector?.secure
				? getHttpsOptions()
				: undefined;

		const proxyWorkerOptions: MiniflareOptions = {
			verbose: true,
			compatibilityFlags: ["nodejs_compat"],
			modulesRoot: path.dirname(proxyWorkerPath),
			modules: [{ type: "ESModule", path: proxyWorkerPath }],
			durableObjects: {
				DURABLE_OBJECT: "ProxyWorker",
			},
			serviceBindings: {
				PROXY_CONTROLLER: async (req): Promise<Response> => {
					const message = (await req.json()) as ProxyWorkerOutgoingRequestBody;

					this.onProxyWorkerMessage(message);

					return new Response(null, { status: 204 });
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// upsttream is how we tell miniflare what request.url should look like inside the worker
			upstream:
				this.latestConfig.dev?.origin &&
				new URL(
					`${this.latestConfig.dev.origin.secure ? "https" : "http"}://${
						this.latestConfig.dev.origin.hostname
					}`
				).href,

			host: this.latestConfig.dev?.server?.hostname,
			port: this.latestConfig.dev?.server?.port,
			https: this.latestConfig.dev?.server?.secure,
			httpsCert: cert?.cert,
			httpsKey: cert?.key,

			// log requests into the ProxyWorker (for local + remote mode)
			log: new ProxyControllerLogger(castLogLevel(logger.loggerLevel), {
				prefix:
					// if debugging, log requests with specic ProxyWorker prefix
					logger.loggerLevel === "debug" ? "wrangler-ProxyWorker" : "wrangler",
			}),
		};
		const inspectorProxyWorkerOptions: MiniflareOptions = {
			verbose: true,
			compatibilityFlags: ["nodejs_compat"],
			modulesRoot: path.dirname(inspectorProxyWorkerPath),
			modules: [{ type: "ESModule", path: inspectorProxyWorkerPath }],
			durableObjects: {
				DURABLE_OBJECT: "InspectorProxyWorker",
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

			host: this.latestConfig.dev?.inspector?.hostname,
			port: this.latestConfig.dev?.inspector?.port,
			https: this.latestConfig.dev?.inspector?.secure,
			httpsCert: cert?.cert,
			httpsKey: cert?.key,

			// only if debugging, log requests to InspectorProxyWorker
			log:
				logger.loggerLevel === "debug"
					? new ProxyControllerLogger(LogLevel.DEBUG, {
							prefix: "wrangler-InspectorProxyWorker",
					  })
					: undefined,
		};

		const proxyWorkerOptionsChanged = didMiniflareOptionsChange(
			this.proxyWorkerOptions,
			proxyWorkerOptions
		);
		const inspectorProxyWorkerOptionsChanged = didMiniflareOptionsChange(
			this.inspectorProxyWorkerOptions,
			inspectorProxyWorkerOptions
		);

		if (this.proxyWorker === undefined) {
			this.proxyWorker = new Miniflare(proxyWorkerOptions);
			this.proxyWorkerOptions = proxyWorkerOptions;
		}
		if (this.inspectorProxyWorker === undefined) {
			this.inspectorProxyWorker = new Miniflare(inspectorProxyWorkerOptions);
			this.inspectorProxyWorkerOptions = inspectorProxyWorkerOptions;
		}

		if (proxyWorkerOptionsChanged || inspectorProxyWorkerOptionsChanged) {
			// this creates a new .ready promise that will be resolved when both ProxyWorkers are ready
			// it also respects any await-ers of the existing .ready promise
			this.ready = createDeferredPromise<ReadyEvent>(this.ready);
		}
		if (proxyWorkerOptionsChanged) {
			logger.debug("ProxyWorker miniflare options changed, reinstantiating...");
			// TODO: ideally we'd use the same miniflare instance via .setOptions but bug: it doesn't respect port changes (easy fix incoming)
			// Ideally we'd do:
			//    void this.proxyWorker.setOptions(proxyWorkerOptions);
			//    this.proxyWorkerOptions = proxyWorkerOptions;
			// Instead, for now, we do:
			void this.proxyWorker.dispose();
			this.proxyWorker = new Miniflare(proxyWorkerOptions);
			this.proxyWorkerOptions = proxyWorkerOptions;
		}
		if (inspectorProxyWorkerOptionsChanged) {
			logger.debug(
				"InspectorProxyWorker miniflare options changed, reinstantiating..."
			);
			// TODO: ideally we'd use the same miniflare instance via .setOptions but bug: it doesn't respect port changes (easy fix incoming)
			// Ideally we'd do:
			//    void this.inspectorProxyWorker.setOptions(inspectorProxyWorkerOptions);
			//    this.inspectorProxyWorkerOptions = inspectorProxyWorkerOptions;
			// Instead, for now, we do:
			void this.inspectorProxyWorker.dispose();
			this.inspectorProxyWorker = new Miniflare(inspectorProxyWorkerOptions);
			this.inspectorProxyWorkerOptions = inspectorProxyWorkerOptions;
		}

		// store the non-null versions for callbacks
		const { proxyWorker, inspectorProxyWorker } = this;

		void Promise.all([proxyWorker.ready, this.reconnectInspectorProxyWorker()])
			.then(() => {
				this.emitReadyEvent(proxyWorker, inspectorProxyWorker);
			})
			.catch((error) => {
				this.emitErrorEvent(
					"Failed to start ProxyWorker or InspectorProxyWorker",
					error
				);
			});

		return this.proxyWorker;
	}

	async reconnectInspectorProxyWorker(): Promise<WebSocket> {
		const existingWebSocket = await this.inspectorProxyWorkerWebSocket;
		if (existingWebSocket?.readyState === WebSocket.READY_STATE_OPEN) {
			return existingWebSocket;
		}

		this.inspectorProxyWorkerWebSocket = createDeferredPromise<WebSocket>();

		let webSocket: WebSocket | null = null;

		try {
			assert(this.inspectorProxyWorker);
			({ webSocket } = await this.inspectorProxyWorker.dispatchFetch(
				"http://dummy/cdn-cgi/InspectorProxyWorker",
				{ headers: { Authorization: this.secret, Upgrade: "websocket" } }
			));
		} catch (cause) {
			const error = castErrorCause(cause);

			this.inspectorProxyWorkerWebSocket?.reject(error);
			this.emitErrorEvent("Could not connect to InspectorProxyWorker", error);
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

	async sendMessageToProxyWorker(
		message: ProxyWorkerIncomingRequestBody,
		retries = 3
	) {
		try {
			assert(this.proxyWorker);

			await this.proxyWorker.dispatchFetch("http://dummy/cdn-cgi/ProxyWorker", {
				headers: { Authorization: this.secret },
				cf: { hostMetadata: message },
			});
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
		message: InspectorProxyWorkerIncomingWebSocketMessage,
		retries = 3
	): Promise<void> {
		try {
			const websocket = await this.inspectorProxyWorkerWebSocket;
			assert(websocket);

			if (websocket.readyState >= WebSocket.READY_STATE_CLOSING) {
				await this.reconnectInspectorProxyWorker();
			}

			websocket.send(JSON.stringify(message));
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
	}
	onReloadComplete(data: ReloadCompleteEvent) {
		this.latestConfig = data.config;
		this.latestBundle = data.bundle;

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
			case "Runtime.consoleAPICalled":
				logConsoleMessage(message.params);

				break;
			case "Runtime.exceptionThrown":
				void logUserWorkerException(
					message.params,
					this.latestBundle?.sourceMapPath
				);

				break;
			default:
				assertNever(message);
		}
	}
	async onInspectorProxyWorkerRequest(
		message: InspectorProxyWorkerOutgoingRequestBody
	) {
		switch (message.type) {
			case "runtime-websocket-error":
				logger.error(message.error);

				break;
			case "error":
				this.emitErrorEvent("Error inside InspectorProxyWorker", message.error);

				break;
			case "get-source-map":
				assert(this.latestConfig !== undefined);
				assert(this.latestBundle !== undefined);

				if (
					this.latestBundle.sourceMapPath !== undefined &&
					this.latestBundle.sourceMapMetadata !== undefined
				) {
					const sourceMap = getSourceMap(
						this.latestConfig.name,
						this.latestBundle.sourceMapPath,
						this.latestBundle.sourceMapMetadata
					);

					return new Response(sourceMap, {
						headers: { "Content-Type": "application/json" },
					});
				}

				break;
			case "debug-log":
				logger.debug("[InspectorProxyWorker]", ...message.args);

				break;
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

		const { proxyWorker, inspectorProxyWorker } = this;
		this.proxyWorker = undefined;
		this.inspectorProxyWorker = undefined;

		try {
			const websocket = await this.inspectorProxyWorkerWebSocket;
			websocket?.close();
		} catch {}

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

	emitReadyEvent(proxyWorker: Miniflare, inspectorProxyWorker: Miniflare) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
			inspectorProxyWorker,
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
	emitErrorEvent(reason: string, cause?: Error | SerializedError) {
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

export class ProxyControllerLogger extends WranglerLog {
	info(message: string) {
		// filter out request logs being handled by the ProxyWorker
		// the requests log remaining are handled by the UserWorker
		// keep the ProxyWorker request logs if we're in debug mode
		if (message.includes("/cdn-cgi/") && this.level !== LogLevel.DEBUG) return;
		super.info(message);
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
