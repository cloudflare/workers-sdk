// import { readFileSync } from "../../parse";
import { Mutex } from "miniflare";
import { getZoneIdHostAndRoutes } from "../../dev";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
} from "../../dev/remote";
import { logger } from "../../logger";
import { RuntimeController } from "./BaseController";
import { notImplemented } from "./NotImplementedError";
import {
	castErrorCause,
	type BundleCompleteEvent,
	type BundleStartEvent,
	type PreviewTokenExpiredEvent,
	type ReloadCompleteEvent,
	type ReloadStartEvent,
} from "./events";
import {
	MissingConfigError,
	coerceBindingsToApiBindings,
	unwrapHook,
} from "./utils";
import type { Trigger } from "./types";

export class RemoteRuntimeController extends RuntimeController {
	abortController = new AbortController();
	mutex = new Mutex();

	async #onBundleComplete({ config, bundle }: BundleCompleteEvent) {
		try {
			this.abortController.abort();
			this.abortController = new AbortController();

			console.log("#onBundleComplete start");

			this.emitReloadStartEvent({ type: "reloadStart", config, bundle });

			const routes = config.triggers
				?.filter(
					(trigger): trigger is Extract<Trigger, { type: "route" }> =>
						trigger.type === "route"
				)
				.map((trigger) => {
					const { type: _, ...route } = trigger;
					return route;
				});
			const workersDev = config.triggers?.some(
				(trigger) => trigger.type === "workers.dev"
			);

			if (!config.dev?.auth) throw new MissingConfigError("config.dev.auth");
			const auth = await unwrapHook(config.dev.auth);
			const { host, zoneId: zone } = await getZoneIdHostAndRoutes(
				{ remote: true, routes: undefined, host: undefined },
				{ routes, dev: { host: config.dev.origin?.hostname }, route: undefined }
			);

			const { workerAccount, workerContext } = getWorkerAccountAndContext({
				accountId: auth.accountId,
				env: config.env, // deprecated service environments -- just pass it through for now
				legacyEnv: config.legacyEnv, // wrangler environment -- just pass it through for now
				zone,
				host,
				routes,
				sendMetrics: config.sendMetrics,
			});

			const session = await createPreviewSession(
				workerAccount,
				workerContext,
				this.abortController.signal
			);

			const init = await createRemoteWorkerInit({
				bundle,
				modules: bundle.modules,
				accountId: auth.accountId,
				name: config.name,
				legacyEnv: config.legacyEnv,
				env: config.env,
				isWorkersSite: config.site !== undefined,
				assetPaths: undefined, // TODO: config.site.assetPaths ?
				format: "modules", // TODO: do we need to support format: service-worker?
				bindings: coerceBindingsToApiBindings(config.bindings),
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,
				usageModel: config.usageModel,
			});

			const workerPreviewToken = await createWorkerPreview(
				init,
				workerAccount,
				workerContext,
				session,
				this.abortController.signal
			);

			this.emitReloadCompletetEvent({
				type: "reloadComplete",
				bundle,
				config,
				proxyData: {
					userWorkerUrl: {
						protocol: config.dev.server?.secure ? "https:" : "http:",
						hostname: workerPreviewToken.host,
						port: config.dev.server?.secure ? "443" : "80",
					},
					userWorkerInspectorUrl: workerPreviewToken.inspectorUrl,
					userWorkerInnerUrlOverrides: {
						hostname: config.dev.origin?.hostname,
						protocol: config.dev.origin?.secure ? "https" : "http",
						port: "",
					},
					headers: { "cf-workers-preview-token": workerPreviewToken.value },
					liveReload: config.dev.liveReload,
				},
			});

			console.log("#onBundleComplete end");
		} catch (_error) {
			// throw _error;
			const error = castErrorCause(_error);

			if (error && "code" in error && error.code !== "ABORT_ERR") {
				// instead of logging the raw API error to the user,
				// give them friendly instructions
				// for error 10063 (workers.dev subdomain required)
				if (error.code === 10063) {
					const errorMessage =
						"Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
					const solutionMessage =
						"You can either enable local mode by pressing l";

					const auth = await unwrapHook(config.dev?.auth);
					const onboardingLink = auth?.accountId
						? `, or register a workers.dev subdomain here: https://dash.cloudflare.com/<${auth.accountId}>/workers/onboarding`
						: "";
					logger.error(
						`${errorMessage}\n${solutionMessage}\n${onboardingLink}`
					);
				} else if (error.code === 10049) {
					logger.log("Preview token expired, fetching a new one");
					// TODO: retry
				} else {
					logger.error("Error on remote worker:", error);
				}
			}
		}
	}

	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {}
	onBundleComplete(ev: BundleCompleteEvent) {
		const { remote = false } = ev.config.dev ?? {};
		if (!remote) return;

		return this.mutex.runWith(() => this.#onBundleComplete(ev));
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		notImplemented(this.onPreviewTokenExpired.name, this.constructor.name);
	}

	async teardown() {
		notImplemented(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompletetEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
