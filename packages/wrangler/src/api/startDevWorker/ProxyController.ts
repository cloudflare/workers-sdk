import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import esbuild from "esbuild";
import { Miniflare, Response } from "miniflare";
// import { readFileSync } from "../../parse";
import { getSourceMap, logConsoleMessage } from "../../inspect";
import { getBasePath } from "../../paths";
import { castErrorCause } from "./events";
import { createDeferredPromise } from "./utils";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type {
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
} from "./events";
import type { StartDevWorkerOptions } from "./types";
import type { WebSocket } from "miniflare";

export class ProxyController extends EventEmitter {
	protected readyResolver!: (_: ReadyEvent) => void;
	public ready: Promise<ReadyEvent> = new Promise((resolve) => {
		this.readyResolver = resolve;
	});

	public proxyWorker: Miniflare | undefined;
	public inspectorProxyWorker: Miniflare | undefined;
	public inspectorProxyWorkerWebSocket = createDeferredPromise<WebSocket>();

	protected config?: StartDevWorkerOptions;
	protected bundle?: EsbuildBundle;
	secret = randomUUID();

	protected createProxyWorker(): Miniflare {
		assert(this.config !== undefined);

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
			https: this.config.dev?.server?.secure,
			host: this.config.dev?.server?.hostname,
			port: this.config.dev?.server?.port, // random port if undefined
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
			serviceBindings: {
				PROXY_CONTROLLER: async (req): Promise<Response> => {
					const url = new URL(req.url);

					if (url.pathname === "/get-source-map") {
						assert(this.config !== undefined);
						assert(this.bundle !== undefined);

						if (
							this.bundle.sourceMapPath !== undefined &&
							this.bundle.sourceMapMetadata !== undefined
						) {
							const sourceMap = getSourceMap(
								this.config.name,
								this.bundle.sourceMapPath,
								this.bundle.sourceMapMetadata
							);
							return new Response(sourceMap, {
								headers: { "Content-Type": "application/json" },
							});
						}
					}

					return new Response(null, { status: 404 });
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// TODO(soon): use Wrangler's self-signed cert creation instead
			https: this.config.dev?.inspector?.secure,
			host: this.config.dev?.inspector?.hostname,
			port: this.config.dev?.inspector?.port, // random port if undefined
		});

		// store the non-null versions for callbacks
		const { proxyWorker, inspectorProxyWorker } = this;

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
		])
			.then(() => {
				this.emitReadyEvent(proxyWorker, inspectorProxyWorker);
			})
			.catch(console.error);

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

		this.config = data.config;
		this.createProxyWorker();

		// void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onBundleStart(_: BundleStartEvent) {
		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onReloadStart(_: ReloadStartEvent) {
		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	onReloadComplete(data: ReloadCompleteEvent) {
		this.bundle = data.bundle;
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

	async teardown() {
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

	emitReadyEvent(proxyWorker: Miniflare, inspectorProxyWorker: Miniflare) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
			inspectorProxyWorker,
		};

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
