import assert from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNever } from "@cloudflare/workers-utils";
import { LogLevel, Miniflare, Mutex, Response } from "miniflare";
import { logger } from "../logger";
import {
	castLogLevel,
	handleStructuredLogs,
	WranglerLog,
} from "../utils/miniflare";
import { Controller } from "./BaseController";
import { castErrorCause } from "./events";
import { createDeferred } from "./utils";
import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	ErrorEvent,
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	SerializedError,
} from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";
import type { LogOptions, MiniflareOptions } from "miniflare";

const proxyWorkerPath = fileURLToPath(
	new URL("./dev-proxy-worker.mjs", import.meta.url)
);

export class ProxyController extends Controller {
	public ready = createDeferred<ReadyEvent>();

	public localServerReady = createDeferred<void>();

	public proxyWorker?: Miniflare;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: Bundle;

	secret = randomUUID();

	protected createProxyWorker() {
		if (this._torndown || this.proxyWorker) {
			return;
		}
		assert(this.latestConfig !== undefined);

		const proxyWorkerOptions: MiniflareOptions = {
			host: this.latestConfig.dev?.server?.hostname,
			port: this.latestConfig.dev?.server?.port,
			https: this.latestConfig.dev?.server?.secure,
			stripDisablePrettyError: false,
			unsafeLocalExplorer: false,
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
			log: new ProxyControllerLogger(
				castLogLevel(logger.loggerLevel),
				{
					prefix:
						// if debugging, log requests with specic ProxyWorker prefix
						logger.loggerLevel === "debug"
							? "wrangler-ProxyWorker"
							: "wrangler",
				},
				this.localServerReady.promise
			),
			handleStructuredLogs,
		};

		const proxyWorker = new Miniflare(proxyWorkerOptions);
		this.proxyWorker = proxyWorker;

		void proxyWorker.ready
			.then((url) => {
				assert(url);
				this.emitReadyEvent(proxyWorker, url);
			})
			.catch((error) => {
				if (this._torndown) {
					return;
				}
				this.emitErrorEvent("Failed to start ProxyWorker", error);
			});
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
		this.localServerReady.resolve();

		this.latestConfig = data.config;
		this.latestBundle = data.bundle;

		void this.sendMessageToProxyWorker({
			type: "play",
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
			default:
				assertNever(message);
		}
	}
	_torndown = false;
	override async teardown() {
		await super.teardown();
		logger.debug("ProxyController teardown beginning...");
		this._torndown = true;

		const { proxyWorker } = this;
		this.proxyWorker = undefined;

		await proxyWorker?.dispose();

		logger.debug("ProxyController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReadyEvent(proxyWorker: Miniflare, url: URL) {
		const data: ReadyEvent = {
			type: "ready",
			proxyWorker,
			url,
		};

		this.ready.resolve(data);
	}
	emitPreviewTokenExpiredEvent(proxyData: ProxyData) {
		this.bus.dispatch({
			type: "previewTokenExpired",
			proxyData,
		});
	}

	override emitErrorEvent(data: ErrorEvent): void;
	override emitErrorEvent(
		reason: string,
		cause?: Error | SerializedError
	): void;
	override emitErrorEvent(
		data: string | ErrorEvent,
		cause?: Error | SerializedError
	) {
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
	constructor(
		level: LogLevel,
		opts: LogOptions,
		private localServerReady: Promise<void>
	) {
		super(level, opts);
	}

	override logReady(message: string): void {
		this.localServerReady.then(() => super.logReady(message)).catch(() => {});
	}

	override log(message: string) {
		// filter out request logs being handled by the ProxyWorker
		// the requests log remaining are handled by the UserWorker
		// keep the ProxyWorker request logs if we're in debug mode
		if (message.includes("/cdn-cgi/") && this.level < LogLevel.DEBUG) {
			return;
		}
		super.log(message);
	}
}
