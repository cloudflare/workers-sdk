import chalk from "chalk";
import { Mutex } from "miniflare";
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
import { MissingConfigError } from "../../errors";
import { logger } from "../../logger";
import { getAccessToken } from "../../user/access";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import { notImplemented } from "./NotImplementedError";
import { convertBindingsToCfWorkerInitBindings, unwrapHook } from "./utils";
import type {
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
import type { Trigger } from "./types";

type CreateRemoteWorkerInitProps = Parameters<typeof createRemoteWorkerInit>[0];

export class RemoteRuntimeController extends RuntimeController {
	#abortController = new AbortController();

	#currentBundleId = 0;
	#mutex = new Mutex();

	#session?: CfPreviewSession;

	async #previewSession(
		props: Parameters<typeof getWorkerAccountAndContext>[0]
	): Promise<CfPreviewSession | undefined> {
		try {
			const { workerAccount, workerContext } =
				await getWorkerAccountAndContext(props);

			return await createPreviewSession(
				props.complianceConfig,
				workerAccount,
				workerContext,
				this.#abortController.signal
			);
		} catch (err: unknown) {
			if (err instanceof Error && err.name == "AbortError") {
				return; // ignore
			}

			handlePreviewSessionCreationError(err, props.accountId);
		}
	}

	async #previewToken(
		props: Omit<CreateRemoteWorkerInitProps, "name"> &
			Partial<Pick<CreateRemoteWorkerInitProps, "name">> &
			Parameters<typeof getWorkerAccountAndContext>[0] & {
				bundleId: number;
				minimal_mode?: boolean;
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
			const { workerAccount, workerContext } = await getWorkerAccountAndContext(
				{
					complianceConfig: props.complianceConfig,
					accountId: props.accountId,
					env: props.env,
					legacyEnv: props.legacyEnv,
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
				legacyEnv: props.legacyEnv,
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
		}
	}

	async #onBundleComplete({ config, bundle }: BundleCompleteEvent, id: number) {
		logger.log(chalk.dim("⎔ Starting remote preview..."));

		try {
			const routes = config.triggers
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

			if (!config.dev?.auth) {
				throw new MissingConfigError("config.dev.auth");
			}

			const auth = await unwrapHook(config.dev.auth);

			if (this.#session) {
				logger.log(chalk.dim("⎔ Detected changes, restarted server."));
			}

			this.#session ??= await this.#previewSession({
				complianceConfig: { compliance_region: config.complianceRegion },
				accountId: auth.accountId,
				apiToken: auth.apiToken,
				env: config.env, // deprecated service environments -- just pass it through for now
				legacyEnv: !config.legacy?.enableServiceEnvironments, // wrangler environment -- just pass it through for now
				host: config.dev.origin?.hostname,
				routes,
				sendMetrics: config.sendMetrics,
				configPath: config.config,
			});

			const { bindings } = await convertBindingsToCfWorkerInitBindings(
				config.bindings
			);

			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (id !== this.#currentBundleId) {
				return;
			}

			const token = await this.#previewToken({
				bundle,
				modules: bundle.modules,
				accountId: auth.accountId,
				complianceConfig: { compliance_region: config.complianceRegion },
				name: config.name,
				legacyEnv: !config.legacy?.enableServiceEnvironments,
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
				// TODO: Remove this passthrough
				bindings: bindings,
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,
				routes,
				host: config.dev.origin?.hostname,
				sendMetrics: config.sendMetrics,
				configPath: config.config,
				bundleId: id,
				minimal_mode: config.dev.remote === "minimal",
			});

			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			// If `token` is undefined, we've surfaced a relevant error to the user above, so ignore this bundle
			if (id !== this.#currentBundleId || !token) {
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
					userWorkerInspectorUrl: {
						protocol: token.inspectorUrl.protocol,
						hostname: token.inspectorUrl.hostname,
						port: token.inspectorUrl.port.toString(),
						pathname: token.inspectorUrl.pathname,
					},
					headers: {
						"cf-workers-preview-token": token.value,
						...(accessToken
							? { Cookie: `CF_Authorization=${accessToken}` }
							: {}),
						// Make sure we don't pass on CF-Connecting-IP to the remote edgeworker instance
						// Without this line, remote previews will fail with `DNS points to prohibited IP`
						"cf-connecting-ip": "",
					},
					liveReload: config.dev.liveReload,
					proxyLogsToController: true,
				},
			});
		} catch (error) {
			if (error instanceof Error && error.name == "AbortError") {
				return; // ignore
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
		notImplemented(this.onPreviewTokenExpired.name, this.constructor.name);
	}

	async teardown() {
		if (this.#session) {
			logger.log(chalk.dim("⎔ Shutting down remote preview..."));
		}
		logger.debug("RemoteRuntimeController teardown beginning...");
		this.#session = undefined;
		this.#abortController.abort();
		logger.debug("RemoteRuntimeController teardown complete");
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
