/**
 * TODO:
 *  - build (Inspector)ProxyWorker.ts ahead of time
 */

import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare, Response } from "miniflare";
// import { readFileSync } from "../../parse";
import { WebSocket } from "miniflare";
import { getHttpsOptions } from "../../https-options";
import {
	getSourceMap,
	logConsoleMessage,
	logUserWorkerException,
} from "../../inspect";
import { logger } from "../../logger";
import { getBasePath } from "../../paths";
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
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	SerializedError,
} from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { MiniflareOptions } from "miniflare";

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

export class ProxyController extends EventEmitter {
	public ready = createDeferredPromise<ReadyEvent>();

	public proxyWorker: Miniflare | undefined;
	public inspectorProxyWorker: Miniflare | undefined;
	inspectorProxyWorkerWebSocket?: DeferredPromise<WebSocket>;
	urls = { proxyWorker: "", inspectorProxyWorker: "" };

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

		const proxyWorkerUrl = JSON.stringify(this.latestConfig?.dev?.server ?? {});
		const inspectorProxyWorkerUrl = JSON.stringify(
			this.latestConfig?.dev?.inspector ?? {}
		);

		const proxyWorkerOptions: MiniflareOptions = {
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
					const message = (await req.json()) as ProxyWorkerOutgoingRequestBody;

					this.onProxyWorkerMessage(message);

					return new Response(null, { status: 204 });
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			host: this.latestConfig.dev?.server?.hostname,
			port: this.latestConfig.dev?.server?.port,
			https: this.latestConfig.dev?.server?.secure,
			httpsCert: cert?.cert,
			httpsKey: cert?.key,
		};
		const inspectorProxyWorkerOptions: MiniflareOptions = {
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
		};

		if (this.proxyWorker === undefined) {
			this.urls.proxyWorker = proxyWorkerUrl;
			this.proxyWorker = new Miniflare(proxyWorkerOptions);
		}
		if (this.inspectorProxyWorker === undefined) {
			this.urls.inspectorProxyWorker = inspectorProxyWorkerUrl;
			this.inspectorProxyWorker = new Miniflare(inspectorProxyWorkerOptions); // separate Miniflare instance while it only permits opening one port
		}
		if (
			this.urls.proxyWorker !== proxyWorkerUrl ||
			this.urls.inspectorProxyWorker !== inspectorProxyWorkerUrl
		) {
			const newReady = createDeferredPromise<ReadyEvent>();
			this.ready.resolve(newReady);
			this.ready = newReady;
		}
		// handle proxyWorker port changes
		if (this.urls.proxyWorker !== proxyWorkerUrl) {
			logger.debug("ProxyWorker address config (config.dev.server.*) changed");
			// TODO: ideally we'd the same miniflare instance via .setOptions but bug: it doesn't respect port changes (easy fix incoming)
			// void this.proxyWorker.setOptions(proxyWorkerOptions);
			void this.proxyWorker.dispose();
			this.proxyWorker = new Miniflare(proxyWorkerOptions);
			this.urls.proxyWorker = proxyWorkerUrl;
		}
		// handle inspectorProxyWorker port changes
		if (this.urls.inspectorProxyWorker !== inspectorProxyWorkerUrl) {
			logger.debug(
				"ProxyWorker address config (config.dev.inspector.*) changed"
			);
			// TODO: ideally we'd the same miniflare instance via .setOptions but bug: it doesn't respect port changes (easy fix incoming)
			// void this.inspectorProxyWorker.setOptions(inspectorProxyWorkerOptions);
			void this.inspectorProxyWorker.dispose();
			this.inspectorProxyWorker = new Miniflare(inspectorProxyWorkerOptions);
			this.urls.inspectorProxyWorker = inspectorProxyWorkerUrl;
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
				"http://dummy/",
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
		message: InspectorProxyWorkerIncomingWebSocketMessage,
		retries = 3
	): Promise<void> {
		try {
			const websocket = await this.inspectorProxyWorkerWebSocket;
			assert(websocket);

			if (websocket.readyState >= WebSocket.READY_STATE_CLOSING) {
				await this.reconnectInspectorProxyWorker();
			}

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
				this.emitPreviewTokenExpiredEvent(message);
				break;

			case "error":
				this.emitErrorEvent("Error inside ProxyWorker", message.error);
				break;
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
			default:
				assertNever(message);
				return new Response(null, { status: 404 });
		}

		return new Response(null, { status: 204 });
	}

	_torndown = false;
	async teardown() {
		console.log("teardown");
		this._torndown = true;

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

	emitReadyEvent(proxyWorker: Miniflare, inspectorProxyWorker: Miniflare) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
			inspectorProxyWorker,
		};

		this.emit("ready", data);
		this.ready.resolve(data);
	}
	emitPreviewTokenExpiredEvent(data: PreviewTokenExpiredEvent) {
		this.emit("previewTokenExpired", data);
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
