import assert from "assert";
import chalk from "chalk";
import { Mutex } from "miniflare";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
	handleUserFriendlyError,
} from "../../dev/remote";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { getAccessToken } from "../../user/access";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import { notImplemented } from "./NotImplementedError";
import {
	convertBindingsToCfWorkerInitBindings,
	MissingConfigError,
	unwrapHook,
} from "./utils";
import type {
	CfPreviewSession,
	CfPreviewToken,
} from "../../dev/create-worker-preview";
import type { ParseError } from "../../parse";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type { Trigger } from "./types";

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
				workerAccount,
				workerContext,
				this.#abortController.signal
			);
		} catch (err: unknown) {
			assert(err && typeof err === "object");
			// instead of logging the raw API error to the user,
			// give them friendly instructions
			// for error 10063 (workers.dev subdomain required)
			if ("code" in err && err.code === 10063) {
				const errorMessage =
					"Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
				const solutionMessage =
					"You can either enable local mode by pressing l, or register a workers.dev subdomain here:";
				const onboardingLink = `https://dash.cloudflare.com/${props.accountId}/workers/onboarding`;
				logger.error(`${errorMessage}\n${solutionMessage}\n${onboardingLink}`);
			} else if (
				"cause" in err &&
				(err.cause as { code: string; hostname: string })?.code === "ENOTFOUND"
			) {
				logger.error(
					`Could not access \`${(err.cause as { code: string; hostname: string }).hostname}\`. Make sure the domain is set up to be proxied by Cloudflare.\nFor more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route`
				);
			} else if (err instanceof UserError) {
				logger.error(err.message);
			}
			// we want to log the error, but not end the process
			// since it could recover after the developer fixes whatever's wrong
			else if ((err as { code: string }).code !== "ABORT_ERR") {
				logger.error("Error while creating remote dev session:", err);
			} else {
				throw err;
			}
		}
	}

	async #previewToken(
		props: Parameters<typeof createRemoteWorkerInit>[0] &
			Parameters<typeof getWorkerAccountAndContext>[0]
	): Promise<CfPreviewToken | undefined> {
		try {
			const init = await createRemoteWorkerInit({
				bundle: props.bundle,
				modules: props.modules,
				accountId: props.accountId,
				name: props.name,
				legacyEnv: props.legacyEnv,
				env: props.env,
				isWorkersSite: props.isWorkersSite,
				assetPaths: props.assetPaths,
				format: props.format,
				bindings: props.bindings,
				compatibilityDate: props.compatibilityDate,
				compatibilityFlags: props.compatibilityFlags,
				usageModel: props.usageModel,
			});

			const { workerAccount, workerContext } = await getWorkerAccountAndContext(
				{
					accountId: props.accountId,
					env: props.env,
					legacyEnv: props.legacyEnv,
					host: props.host,
					routes: props.routes,
					sendMetrics: props.sendMetrics,
				}
			);
			if (!this.#session) {
				return;
			}

			const workerPreviewToken = await createWorkerPreview(
				init,
				workerAccount,
				workerContext,
				this.#session,
				this.#abortController.signal
			);

			return workerPreviewToken;
		} catch (err: unknown) {
			assert(err && typeof err === "object");
			// we want to log the error, but not end the process
			// since it could recover after the developer fixes whatever's wrong
			// instead of logging the raw API error to the user,
			// give them friendly instructions
			if ((err as unknown as { code: string }).code !== "ABORT_ERR") {
				// code 10049 happens when the preview token expires
				if ("code" in err && err.code === 10049) {
					logger.log("Preview session expired, fetching a new one");

					this.#session = await this.#previewSession(props);
					return this.#previewToken(props);
				} else if (
					!handleUserFriendlyError(err as ParseError, props.accountId)
				) {
					logger.error("Error on remote worker:", err);
				}
			} else {
				throw err;
			}
		}
	}

	async #onBundleComplete({ config, bundle }: BundleCompleteEvent, id: number) {
		try {
			const routes = config.triggers
				?.filter(
					(trigger): trigger is Extract<Trigger, { type: "route" }> =>
						trigger.type === "route"
				)
				.map((trigger) => {
					const { type: _, ...route } = trigger;
					if (!("custom_domain" in route)) {
						return route.pattern;
					}
					return route;
				});

			if (!config.dev?.auth) {
				throw new MissingConfigError("config.dev.auth");
			}
			const auth = await unwrapHook(config.dev.auth);

			if (this.#session) {
				logger.log(chalk.dim("⎔ Detected changes, restarted server."));
			}

			this.#session ??= await this.#previewSession({
				accountId: auth.accountId,
				env: config.env, // deprecated service environments -- just pass it through for now
				legacyEnv: config.legacyEnv, // wrangler environment -- just pass it through for now
				host: config.dev.origin?.hostname,
				routes,
				sendMetrics: config.sendMetrics,
			});

			const bindings = (
				await convertBindingsToCfWorkerInitBindings(config.bindings)
			).bindings;

			const token = await this.#previewToken({
				bundle,
				modules: bundle.modules,
				accountId: auth.accountId,
				name: config.name,
				legacyEnv: config.legacyEnv,
				env: config.env,
				isWorkersSite: config.site !== undefined,
				assetPaths: config.site?.path
					? {
							baseDirectory: config.site.path,
							assetDirectory: "",
							excludePatterns: config.site.exclude ?? [],
							includePatterns: config.site.include ?? [],
						}
					: undefined,
				format: bundle.entry.format,
				// TODO: Remove this passthrough
				bindings: config._bindings ? config._bindings : bindings,
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,
				usageModel: config.usageModel,
				routes,
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
					userWorkerInnerUrlOverrides: {
						hostname: token.host,
					},
					headers: {
						"cf-workers-preview-token": token.value,
						...(accessToken
							? { Cookie: `CF_Authorization=${accessToken}` }
							: {}),
					},
					liveReload: config.dev.liveReload,
					proxyLogsToController: true,
					internalDurableObjects: [],
					entrypointAddresses: {},
				},
			});
		} catch (error) {
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
		// There's no way to teardown remote preview sessions, and so this is ignored in remote mode
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
