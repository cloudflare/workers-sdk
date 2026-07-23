import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { assertNever } from "@cloudflare/workers-utils";
import { Log, LogLevel, Miniflare, Mutex, Response } from "miniflare";
import proxyWorkerSource from "worker:startDevWorker/ProxyWorker";
import { logger } from "../logger";
import { castLogLevel, handleStructuredLogs } from "../utils/miniflare";
import { castErrorCause } from "./events";
import { createDeferred } from "./utils";
import type {
	ErrorEvent,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
	ReadyEvent,
	ReloadCompleteEvent,
	SerializedError,
} from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";
import type { LogOptions, MiniflareOptions } from "miniflare";

export class ProxyController {
	public ready = createDeferred<ReadyEvent>();

	public localServerReady = createDeferred<void>();

	public proxyWorker?: Miniflare;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: Bundle;

	secret = randomUUID();

	constructor(
		private onError: (event: ErrorEvent) => void,
		private onPreviewTokenExpired: () => void
	) {}

	protected createProxyWorker() {
		if (this._torndown || this.proxyWorker) {
			return;
		}
		assert(this.latestConfig !== undefined);

		const proxyWorkerOptions: MiniflareOptions = {
			host: this.latestConfig.server.hostname,
			port: this.latestConfig.server.port,
			https: this.latestConfig.server.secure,
			stripDisablePrettyError: false,
			unsafeLocalExplorer: false,
			workers: [
				{
					name: "ProxyWorker",
					compatibilityDate: "2023-12-18",
					compatibilityFlags: ["nodejs_compat"],
					modules: [
						{
							type: "ESModule",
							path: "dev-proxy-worker.mjs",
							contents: proxyWorkerSource,
						},
					],
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
							? "remote-bindings-ProxyWorker"
							: "remote-bindings",
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
	start(config: StartDevWorkerOptions) {
		this.latestConfig = config;
		this.createProxyWorker();
	}
	pause(config: StartDevWorkerOptions) {
		this.latestConfig = config;
		void this.sendMessageToProxyWorker({ type: "pause" });
	}
	play(data: ReloadCompleteEvent) {
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
				this.onPreviewTokenExpired();

				break;
			case "error":
				this.emitErrorEvent("Error inside ProxyWorker", message.error);

				break;
			default:
				assertNever(message);
		}
	}
	_torndown = false;
	async teardown() {
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
		if (this._torndown) {
			logger.debug("Suppressing error event during teardown");
			logger.debug(`Error in ${data.source}: ${data.reason}\n`, data.cause);
			logger.debug("=> Error contextual data:", data.data);
			return;
		}
		this.onError(data);
	}
}

class ProxyControllerLogger extends Log {
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
