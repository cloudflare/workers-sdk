import { MissingConfigError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Mutex } from "miniflare";
import { WebSocket } from "ws";
import { version as packageVersion } from "../../../package.json";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
	handlePreviewSessionCreationError,
	handlePreviewSessionUploadError,
} from "../../dev/remote";
import { logger } from "../../logger";
import { TRACE_VERSION } from "../../tail/createTail";
import { realishPrintLogs } from "../../tail/printing";
import { getAccessToken } from "../../user/access";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import { unwrapHook } from "./utils";
import type {
	CfAccount,
	CfPreviewSession,
	CfPreviewToken,
} from "../../dev/create-worker-preview";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type { Bundle, StartDevWorkerOptions, Trigger } from "./types";
import type { Route } from "@cloudflare/workers-utils";

type CreateRemoteWorkerInitProps = Parameters<typeof createRemoteWorkerInit>[0];

export class RemoteRuntimeController extends RuntimeController {
	#abortController = new AbortController();

	#currentBundleId = 0;
	#mutex = new Mutex();

	#session?: CfPreviewSession;

	#activeTail?: WebSocket;

	#latestConfig?: StartDevWorkerOptions;
	#latestBundle?: Bundle;
	#latestRoutes?: Route[];

	async #previewSession(
		props: Parameters<typeof getWorkerAccountAndContext>[0] & {
			tail_logs: boolean;
		}
	): Promise<CfPreviewSession | undefined> {
		try {
			const { workerAccount, workerContext } =
				await getWorkerAccountAndContext(props);

			return await createPreviewSession(
				props.complianceConfig,
				workerAccount,
				workerContext,
				this.#abortController.signal,
				props.tail_logs
			);
		} catch (err: unknown) {
			if (err instanceof Error && err.name == "AbortError") {
				return; // ignore
			}

			handlePreviewSessionCreationError(err, props.accountId);

			this.emitErrorEvent({
				type: "error",
				reason: "Failed to create a preview token",
				cause: castErrorCause(err),
				source: "RemoteRuntimeController",
				data: undefined,
			});
		}
	}

	async #previewToken(
		props: Omit<CreateRemoteWorkerInitProps, "name"> &
			Partial<Pick<CreateRemoteWorkerInitProps, "name">> &
			Parameters<typeof getWorkerAccountAndContext>[0] & {
				bundleId: number;
				minimal_mode?: boolean;
				tail_logs: boolean;
			}
	): Promise<CfPreviewToken | undefined> {
		if (!this.#session) {
			return;
		}

		try {
			/*
			 * Since `getWorkerAccountAndContext`, `createRemoteWorkerInit` and
			 * `createWorkerPreview` are all async functions, it is technically
			 * possible that new `bundleComplete` events are trigerred while those
			 * functions are still executing. In such cases we want to drop the
			 * current bundle and exit early, to avoid unnecessarily executing any
			 * further expensive API calls.
			 *
			 * For this purpose, we want perform a check before each of these
			 * functions, to ensure no new `bundleComplete` was triggered.
			 */
			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (props.bundleId !== this.#currentBundleId) {
				return;
			}
			this.#activeTail?.terminate();
			const { workerAccount, workerContext } = await getWorkerAccountAndContext(
				{
					complianceConfig: props.complianceConfig,
					accountId: props.accountId,
					env: props.env,
					useServiceEnvironments: props.useServiceEnvironments,
					host: props.host,
					routes: props.routes,
					sendMetrics: props.sendMetrics,
					configPath: props.configPath,
				}
			);

			const scriptId =
				props.name ||
				(workerContext.zone
					? this.#session.id
					: this.#session.host.split(".")[0]);

			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (props.bundleId !== this.#currentBundleId) {
				return;
			}
			const init = await createRemoteWorkerInit({
				complianceConfig: props.complianceConfig,
				bundle: props.bundle,
				modules: props.modules,
				accountId: props.accountId,
				name: scriptId,
				useServiceEnvironments: props.useServiceEnvironments,
				env: props.env,
				isWorkersSite: props.isWorkersSite,
				assets: props.assets,
				legacyAssetPaths: props.legacyAssetPaths,
				format: props.format,
				bindings: props.bindings,
				compatibilityDate: props.compatibilityDate,
				compatibilityFlags: props.compatibilityFlags,
			});

			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (props.bundleId !== this.#currentBundleId) {
				return;
			}
			const workerPreviewToken = await createWorkerPreview(
				props.complianceConfig,
				init,
				workerAccount,
				workerContext,
				this.#session,
				this.#abortController.signal,
				props.minimal_mode
			);

			if (props.tail_logs && workerPreviewToken.tailUrl) {
				this.#activeTail = new WebSocket(
					workerPreviewToken.tailUrl,
					TRACE_VERSION,
					{
						headers: {
							"Sec-WebSocket-Protocol": TRACE_VERSION, // needs to be `trace-v1` to be accepted
							"User-Agent": `wrangler/${packageVersion}`,
						},
						signal: this.#abortController.signal,
					}
				);

				this.#activeTail.on("message", realishPrintLogs);
			}
			return workerPreviewToken;
		} catch (err: unknown) {
			if (err instanceof Error && err.name == "AbortError") {
				return; // ignore
			}

			const shouldRestartSession = handlePreviewSessionUploadError(
				err,
				props.accountId
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

	#getPreviewSession(
		config: StartDevWorkerOptions,
		auth: CfAccount,
		routes: Route[] | undefined
	) {
		return this.#previewSession({
			complianceConfig: { compliance_region: config.complianceRegion },
			accountId: auth.accountId,
			apiToken: auth.apiToken,
			env: config.env,
			useServiceEnvironments: config.legacy?.useServiceEnvironments,
			host: config.dev.origin?.hostname,
			routes,
			sendMetrics: config.sendMetrics,
			configPath: config.config,
			tail_logs: !!config.experimental?.tailLogs,
		});
	}

	#extractRoutes(config: StartDevWorkerOptions): Route[] | undefined {
		return config.triggers
			?.filter(
				(trigger): trigger is Extract<Trigger, { type: "route" }> =>
					trigger.type === "route"
			)
			.map((trigger) => {
				const { type: _, ...route } = trigger;
				if (
					"custom_domain" in route ||
					"zone_id" in route ||
					"zone_name" in route
				) {
					return route;
				} else {
					return route.pattern;
				}
			});
	}

	async #updatePreviewToken(
		config: StartDevWorkerOptions,
		bundle: Bundle,
		auth: CfAccount,
		routes: Route[] | undefined,
		bundleId: number
	) {
		// If we received a new `bundleComplete` event before we were able to
		// dispatch a `reloadComplete` for this bundle, ignore this bundle.
		if (bundleId !== this.#currentBundleId) {
			return;
		}

		const token = await this.#previewToken({
			bundle,
			modules: bundle.modules,
			accountId: auth.accountId,
			complianceConfig: { compliance_region: config.complianceRegion },
			name: config.name,
			useServiceEnvironments: config.legacy?.useServiceEnvironments,
			env: config.env,
			isWorkersSite: config.legacy?.site !== undefined,
			assets: config.assets,
			legacyAssetPaths: config.legacy?.site?.bucket
				? {
						baseDirectory: config.legacy?.site?.bucket,
						assetDirectory: "",
						excludePatterns: config.legacy?.site?.exclude ?? [],
						includePatterns: config.legacy?.site?.include ?? [],
					}
				: undefined,
			format: bundle.entry.format,
			bindings: config.bindings,
			compatibilityDate: config.compatibilityDate,
			compatibilityFlags: config.compatibilityFlags,
			routes,
			host: config.dev.origin?.hostname,
			sendMetrics: config.sendMetrics,
			configPath: config.config,
			bundleId,
			minimal_mode: config.dev.remote === "minimal",
			tail_logs: !!config.experimental?.tailLogs,
		});
		// If we received a new `bundleComplete` event before we were able to
		// dispatch a `reloadComplete` for this bundle, ignore this bundle.
		// If `token` is undefined, we've surfaced a relevant error to the user above, so ignore this bundle
		if (bundleId !== this.#currentBundleId || !token) {
			return;
		}

		const accessToken = await getAccessToken(token.host);

		this.emitReloadCompleteEvent({
			type: "reloadComplete",
			bundle,
			config,
			proxyData: {
				userWorkerUrl: {
					protocol: "https:",
					hostname: token.host,
					port: "443",
				},
				...(!config.experimental?.tailLogs && token.inspectorUrl
					? {
							userWorkerInspectorUrl: {
								protocol: token.inspectorUrl.protocol,
								hostname: token.inspectorUrl.hostname,
								port: token.inspectorUrl.port.toString(),
								pathname: token.inspectorUrl.pathname,
							},
						}
					: {}),
				headers: {
					"cf-workers-preview-token": token.value,
					...(accessToken ? { Cookie: `CF_Authorization=${accessToken}` } : {}),
					"cf-connecting-ip": "",
				},
				liveReload: config.dev.liveReload,
				proxyLogsToController: true,
			},
		});
	}

	async #onBundleComplete({ config, bundle }: BundleCompleteEvent, id: number) {
		logger.log(chalk.dim("⎔ Starting remote preview..."));

		try {
			const routes = this.#extractRoutes(config);

			if (!config.dev?.auth) {
				throw new MissingConfigError("config.dev.auth");
			}

			const auth = await unwrapHook(config.dev.auth);

			// Store for token refresh
			this.#latestConfig = config;
			this.#latestBundle = bundle;
			this.#latestRoutes = routes;

			if (this.#session) {
				logger.log(chalk.dim("⎔ Detected changes, restarted server."));
			}

			this.#session ??= await this.#getPreviewSession(config, auth, routes);
			await this.#updatePreviewToken(config, bundle, auth, routes, id);
		} catch (error) {
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

	async #refreshPreviewToken() {
		if (!this.#latestConfig || !this.#latestBundle) {
			logger.warn(
				"Cannot refresh preview token: missing config or bundle data"
			);
			return;
		}

		this.emitReloadStartEvent({
			type: "reloadStart",
			config: this.#latestConfig,
			bundle: this.#latestBundle,
		});

		if (!this.#latestConfig.dev?.auth) {
			// This shouldn't happen as it's checked earlier, but we guard against it anyway
			throw new MissingConfigError("config.dev.auth");
		}

		const auth = await unwrapHook(this.#latestConfig.dev.auth);

		try {
			this.#session = await this.#getPreviewSession(
				this.#latestConfig,
				auth,
				this.#latestRoutes
			);

			await this.#updatePreviewToken(
				this.#latestConfig,
				this.#latestBundle,
				auth,
				this.#latestRoutes,
				this.#currentBundleId
			);
			logger.log(chalk.green("✔ Preview token refreshed successfully"));
		} catch (error) {
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

	onBundleStart(_: BundleStartEvent) {
		// Abort any previous operations when a new bundle is started
		this.#abortController.abort();
		this.#abortController = new AbortController();
	}
	onBundleComplete(ev: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;

		if (!ev.config.dev?.remote) {
			void this.#mutex.runWith(() => this.teardown());
			return;
		}

		this.emitReloadStartEvent({
			type: "reloadStart",
			config: ev.config,
			bundle: ev.bundle,
		});

		void this.#mutex.runWith(() => this.#onBundleComplete(ev, id));
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		logger.log(chalk.dim("⎔ Preview token expired, refreshing..."));
		void this.#mutex.runWith(() => this.#refreshPreviewToken());
	}

	override async teardown() {
		await super.teardown();
		if (this.#session) {
			logger.log(chalk.dim("⎔ Shutting down remote preview..."));
		}
		logger.debug("RemoteRuntimeController teardown beginning...");
		this.#session = undefined;
		this.#abortController.abort();
		this.#activeTail?.terminate();
		logger.debug("RemoteRuntimeController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.bus.dispatch(data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.bus.dispatch(data);
	}
}
