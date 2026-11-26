import { getAccessHeaders } from "@cloudflare/workers-auth";
import { retryOnAPIFailure } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Mutex } from "miniflare";
import { WebSocket } from "ws";
import { version as packageVersion } from "../../package.json";
import { logger } from "../logger";
import { TRACE_VERSION } from "../utils/constants";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../utils/create-worker-preview";
import { realishPrintLogs } from "../utils/printing";
import {
	createRemoteWorkerInit,
	handlePreviewSessionCreationError,
	handlePreviewSessionUploadError,
} from "../utils/remote";
import { castErrorCause } from "./events";
import { PREVIEW_TOKEN_REFRESH_INTERVAL, unwrapHook } from "./utils";
import type {
	CfAccount,
	CfPreviewSession,
	CfPreviewToken,
} from "../utils/create-worker-preview";
import type { RemoteBindingsCliDisplayName } from "../utils/remote";
import type {
	BundleCompleteEvent,
	ErrorEvent,
	ProxyData,
	ReloadCompleteEvent,
} from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type CreateRemoteWorkerInitProps = Parameters<typeof createRemoteWorkerInit>[0];

export class RemoteRuntimeController {
	#abortController = new AbortController();

	#currentBundleId = 0;
	#mutex = new Mutex();

	#session?: CfPreviewSession;

	#activeTail?: WebSocket;

	#latestConfig?: StartDevWorkerOptions;
	#latestBundle?: Bundle;
	#latestProxyData?: ProxyData;

	#tearingDown = false;

	constructor(
		private onError: (event: ErrorEvent) => void,
		private onReloadComplete: (event: ReloadCompleteEvent) => void
	) {}

	async #previewSession(
		props: CfAccount & {
			complianceConfig: ComplianceConfig;
			name: string;
			cliDisplayName: RemoteBindingsCliDisplayName;
		}
	): Promise<CfPreviewSession | undefined> {
		try {
			return await retryOnAPIFailure(
				() =>
					createPreviewSession(
						props.complianceConfig,
						props,
						this.#abortController.signal,
						props.name,
						props.cliDisplayName
					),
				logger,
				undefined,
				undefined,
				this.#abortController.signal
			);
		} catch (err: unknown) {
			if (err instanceof Error && err.name == "AbortError") {
				return; // ignore
			}

			handlePreviewSessionCreationError(
				err,
				props.accountId,
				props.cliDisplayName
			);

			throw err;
		}
	}

	async #previewToken(
		props: CreateRemoteWorkerInitProps &
			CfAccount & {
				complianceConfig: ComplianceConfig;
				cliDisplayName: RemoteBindingsCliDisplayName;
				bundleId: number;
			}
	): Promise<CfPreviewToken | undefined> {
		if (!this.#session) {
			return;
		}
		// Capture session in a local variable so TypeScript can narrow
		// the type inside the retryOnAPIFailure closure below.
		const session = this.#session;

		try {
			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (props.bundleId !== this.#currentBundleId) {
				return;
			}
			// Suppress errors from terminating a WebSocket that hasn't connected yet
			this.#activeTail?.removeAllListeners("error");
			this.#activeTail?.on("error", () => {});
			this.#activeTail?.terminate();
			const init = createRemoteWorkerInit({
				bundle: props.bundle,
				name: props.name,
				bindings: props.bindings,
				compatibilityDate: props.compatibilityDate,
				compatibilityFlags: props.compatibilityFlags,
			});

			const workerPreviewToken = await retryOnAPIFailure(
				() =>
					createWorkerPreview(
						props.complianceConfig,
						init,
						props,
						session,
						this.#abortController.signal
					),
				logger,
				undefined,
				undefined,
				this.#abortController.signal
			);

			if (workerPreviewToken.tailUrl) {
				this.#activeTail = new WebSocket(
					workerPreviewToken.tailUrl,
					TRACE_VERSION,
					{
						headers: {
							"Sec-WebSocket-Protocol": TRACE_VERSION, // needs to be `trace-v1` to be accepted
							"User-Agent": `remote-bindings/${packageVersion}`,
						},
						signal: this.#abortController.signal,
					}
				);

				this.#activeTail.on("message", realishPrintLogs);
				// Best-effort log streaming: ignore errors instead of letting them
				// propagate as unhandled exceptions. The signal we pass to the `ws`
				// constructor is shared with update cancellation, which destroys
				// the underlying upgrade request with `AbortError` every time a new
				// bundle starts. The existing `terminate` paths in `#previewToken`
				// and `teardown()` re-install no-op listeners before shutting the
				// tail down — this listener covers the window between WebSocket
				// construction and the next terminate, plus any transient network
				// errors during normal operation.
				this.#activeTail.on("error", (err) => {
					logger.debug("Active tail WebSocket error (ignored):", err);
				});
			}
			return workerPreviewToken;
		} catch (err: unknown) {
			if (err instanceof Error && err.name == "AbortError") {
				return; // ignore
			}

			const shouldRestartSession = handlePreviewSessionUploadError(
				err,
				props.accountId,
				props.cliDisplayName
			);
			if (shouldRestartSession) {
				this.#session = await this.#previewSession(props);
				return this.#previewToken(props);
			}

			this.emitErrorEvent({
				type: "error",
				reason: "Failed to obtain a preview token",
				cause: castErrorCause(err),
				source: "RemoteRuntimeController",
				data: undefined,
			});
		}
	}

	#getPreviewSession(config: StartDevWorkerOptions, auth: CfAccount) {
		return this.#previewSession({
			complianceConfig: { compliance_region: config.complianceRegion },
			accountId: auth.accountId,
			apiToken: auth.apiToken,
			name: config.name,
			cliDisplayName: config.cliDisplayName,
		});
	}

	async #updatePreviewToken(
		config: StartDevWorkerOptions,
		bundle: Bundle,
		auth: CfAccount,
		bundleId: number
	): Promise<boolean> {
		// If we received a new `bundleComplete` event before we were able to
		// dispatch a `reloadComplete` for this bundle, ignore this bundle.
		if (bundleId !== this.#currentBundleId) {
			return false;
		}

		const token = await this.#previewToken({
			bundle,
			accountId: auth.accountId,
			apiToken: auth.apiToken,
			complianceConfig: { compliance_region: config.complianceRegion },
			name: config.name,
			bindings: config.bindings,
			compatibilityDate: config.compatibilityDate,
			compatibilityFlags: config.compatibilityFlags,
			cliDisplayName: config.cliDisplayName,
			bundleId,
		});
		// If we received a new `bundleComplete` event before we were able to
		// dispatch a `reloadComplete` for this bundle, ignore this bundle.
		// If `token` is undefined, we've surfaced a relevant error to the user above, so ignore this bundle
		if (bundleId !== this.#currentBundleId || !token) {
			return false;
		}

		const accessHeaders = await getAccessHeaders(token.host, {
			logger,
			cliDisplayName: config.cliDisplayName,
			previewToken: token.value,
		});
		if (bundleId !== this.#currentBundleId || this.#tearingDown) {
			return false;
		}

		const proxyData: ProxyData = {
			refreshAt: Date.now() + PREVIEW_TOKEN_REFRESH_INTERVAL,
			userWorkerUrl: {
				protocol: "https:",
				hostname: token.host,
				port: "443",
			},
			headers: {
				"cf-workers-preview-token": token.value,
				...accessHeaders,
				"cf-connecting-ip": "",
			},
		};

		this.#latestProxyData = proxyData;

		this.onReloadComplete({
			type: "reloadComplete",
			bundle,
			config,
			proxyData,
		});

		return true;
	}

	async #onBundleComplete({ config, bundle }: BundleCompleteEvent, id: number) {
		// A newer bundle has already been queued — skip this stale one.
		if (id !== this.#currentBundleId || this.#tearingDown) {
			return;
		}

		logger.log(chalk.dim("⎔ Starting remote preview..."));

		try {
			const auth = await unwrapHook(config.auth);
			if (id !== this.#currentBundleId || this.#tearingDown) {
				return;
			}

			this.#latestConfig = config;
			this.#latestBundle = bundle;
			this.#session = await this.#getPreviewSession(config, auth);
			await this.#updatePreviewToken(config, bundle, auth, id);
		} catch (error) {
			if (id !== this.#currentBundleId || this.#tearingDown) {
				return;
			}
			if (error instanceof Error && error.name == "AbortError") {
				return;
			}

			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading remote server",
				cause: castErrorCause(error),
				source: "RemoteRuntimeController",
				data: undefined,
			});
		}
	}

	async #refreshPreviewToken(bundleId: number) {
		if (this.#tearingDown || bundleId !== this.#currentBundleId) {
			return;
		}
		const config = this.#latestConfig;
		const bundle = this.#latestBundle;
		if (!config || !bundle) {
			logger.warn(
				"Cannot refresh preview token: missing config or bundle data"
			);
			return;
		}

		const abortSignal = this.#abortController.signal;
		const isCurrent = () =>
			bundleId === this.#currentBundleId &&
			!abortSignal.aborted &&
			!this.#tearingDown;
		try {
			const auth = await unwrapHook(config.auth);
			if (!isCurrent()) {
				return;
			}

			const session = await this.#getPreviewSession(config, auth);
			if (!isCurrent()) {
				return;
			}
			this.#session = session;

			const refreshed = await this.#updatePreviewToken(
				config,
				bundle,
				auth,
				bundleId
			);

			if (refreshed) {
				logger.log(chalk.green("✔ Preview token refreshed successfully"));
			}
		} catch (error) {
			// A superseded lazy refresh must not fail calls waiting for the new bindings.
			if (!isCurrent()) {
				return;
			}
			if (error instanceof Error && error.name == "AbortError") {
				return;
			}

			this.emitErrorEvent({
				type: "error",
				reason: "Error refreshing preview token",
				cause: castErrorCause(error),
				source: "RemoteRuntimeController",
				data: undefined,
			});
		}
	}

	// ******************
	//   Event Handlers
	// ******************

	onUpdateStart() {
		// Lazy sessions can stay paused until the next binding call. Invalidate
		// in-flight work now, even though the replacement bundle isn't queued yet.
		this.#currentBundleId++;
		// Abort any previous operations when a new bundle is started
		this.#abortController.abort();
		this.#abortController = new AbortController();
		this.#latestConfig = undefined;
		this.#latestBundle = undefined;
		this.#latestProxyData = undefined;
	}
	onBundleComplete(ev: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;

		void this.#mutex.runWith(() => this.#onBundleComplete(ev, id));
	}
	onPreviewTokenExpired(): void {
		if (!this.#latestProxyData || this.#tearingDown) {
			return;
		}
		const bundleId = this.#currentBundleId;
		logger.log(chalk.dim("⎔ Refreshing preview token..."));
		void this.#mutex.runWith(() => this.#refreshPreviewToken(bundleId));
	}

	async teardown() {
		this.#tearingDown = true;
		if (this.#session) {
			logger.log(chalk.dim("⎔ Shutting down remote preview..."));
		}
		logger.debug("RemoteRuntimeController teardown beginning...");
		this.#session = undefined;
		this.#abortController.abort();
		// Suppress errors from terminating a WebSocket that hasn't connected yet
		this.#activeTail?.removeAllListeners("error");
		this.#activeTail?.on("error", () => {});
		this.#activeTail?.terminate();
		logger.debug("RemoteRuntimeController teardown complete");
	}

	private emitErrorEvent(event: ErrorEvent) {
		if (this.#tearingDown) {
			logger.debug("Suppressing error event during teardown");
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
			return;
		}
		this.onError(event);
	}
}
