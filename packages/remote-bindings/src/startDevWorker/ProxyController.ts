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
import type { EsbuildBundle } from "../utils/use-esbuild";
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
import type { StartDevWorkerOptions } from "./types";
import type { LogOptions, MiniflareOptions } from "miniflare";

const proxyWorkerPath = fileURLToPath(
	new URL("./dev-proxy-worker.mjs", import.meta.url)
);

export class ProxyController extends Controller {
	public ready = createDeferred<ReadyEvent>();

	public localServerReady = createDeferred<void>();

	public proxyWorker?: Miniflare;
	proxyWorkerOptions?: MiniflareOptions;

	protected latestConfig?: StartDevWorkerOptions;
	protected latestBundle?: EsbuildBundle;

	secret = randomUUID();

	protected createProxyWorker() {
		if (this._torndown) {
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
			liveReload: false,
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
			void proxyWorker.ready
				.then((url) => {
					assert(url);
					this.emitReadyEvent(proxyWorker, url, undefined);
				})
				.catch((error) => {
					if (this._torndown) {
						return;
					}
					this.emitErrorEvent("Failed to start ProxyWorker", error);
				});
		}
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
			case "debug-log":
				logger.debug("[ProxyWorker]", ...message.args);

				break;
			case "sseResponseDetected":
				// Only warn about SSE if a quick tunnel is active
				if (
					this.latestConfig?.dev?.tunnel?.enabled &&
					this.latestConfig.dev.tunnel.name === undefined
				) {
					logger.once.warn(
						"Quick tunnels do not support Server-Sent Events (SSE). Use a named Cloudflare Tunnel if you need SSE over a public URL."
					);
				}

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
