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
import { assertNever, createDeferredPromise } from "./utils";
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

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: EsbuildBundle;
	secret = randomUUID();

	protected createProxyWorker(): Miniflare {
		assert(this.latestConfig !== undefined);

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
					const message = (await req.json()) as ProxyWorkerOutgoingRequestBody;

					this.onProxyWorkerMessage(message);

					return new Response(null, { status: 204 });
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// TODO(soon): use Wrangler's self-signed cert creation instead
			https: this.latestConfig.dev?.server?.secure,
			host: this.latestConfig.dev?.server?.hostname,
			port: this.latestConfig.dev?.server?.port, // random port if undefined
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
					const body =
						(await req.json()) as InspectorProxyWorkerOutgoingRequestBody;

					return this.onInspectorProxyWorkerRequest(body);
				},
			},
			bindings: {
				PROXY_CONTROLLER_AUTH_SECRET: this.secret,
			},

			// TODO(soon): use Wrangler's self-signed cert creation instead
			https: this.latestConfig.dev?.inspector?.secure,
			host: this.latestConfig.dev?.inspector?.hostname,
			port: this.latestConfig.dev?.inspector?.port, // random port if undefined
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

		this.latestConfig = data.config;
		this.createProxyWorker();

		// void this.sendMessageToProxyWorker({ type: "pause" });
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
				// TODO: handle user worker exception
				break;
			default:
				assertNever(message);
		}
	}
	async onInspectorProxyWorkerRequest(
		message: InspectorProxyWorkerOutgoingRequestBody
	) {
		switch (message.type) {
			case "error":
				// TODO: handle error

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
