import { EventEmitter } from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import { MiniflareCoreError } from "miniflare";
import { logger } from "../logger";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { ControllerBus, ControllerEvent } from "./BaseController";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerOptions, Worker } from "./types";

export class DevEnv extends EventEmitter implements ControllerBus {
	config: ConfigController;
	bundler: BundlerController;
	runtime: RemoteRuntimeController;
	proxy: ProxyController;

	async startWorker(options: StartDevWorkerOptions): Promise<Worker> {
		const worker = createWorkerObject(this);

		try {
			await this.config.set(options);
		} catch (e) {
			const error = new Error("An error occurred when starting the server", {
				cause: e,
			});
			this.proxy.ready.reject(error);
			await worker.dispose();
			throw e;
		}

		return worker;
	}

	constructor() {
		super();

		this.config = new ConfigController(this);
		this.bundler = new BundlerController(this);
		this.runtime = new RemoteRuntimeController(this);
		this.proxy = new ProxyController(this);

		this.on("error", (event: ErrorEvent) => {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		});
	}

	/**
	 * Central message bus dispatch method.
	 * All events from controllers flow through here, making the event routing explicit and traceable.
	 *
	 * Event flow:
	 * - ConfigController emits configUpdate → BundlerController, ProxyController
	 * - BundlerController emits bundleStart → ProxyController, RuntimeControllers
	 * - BundlerController emits bundleComplete → RuntimeControllers
	 * - RuntimeController emits reloadStart → ProxyController
	 * - RuntimeController emits reloadComplete → ProxyController
	 * - ProxyController emits previewTokenExpired → RuntimeControllers
	 * - Any controller emits error → DevEnv error handler
	 *
	 * `reloadComplete` is also re-emitted as an external EventEmitter event
	 * (`devEnv.on("reloadComplete", ...)`) so callers like
	 * `RemoteProxySession.updateBindings` can wait for the reload to finish.
	 */
	dispatch(event: ControllerEvent): void {
		switch (event.type) {
			case "error":
				this.handleErrorEvent(event);
				break;

			case "configUpdate":
				this.bundler.onConfigUpdate(event);
				this.proxy.onConfigUpdate(event);
				break;

			case "bundleStart":
				this.proxy.onBundleStart(event);
				this.runtime.onBundleStart(event);
				break;

			case "bundleComplete":
				this.runtime.onBundleComplete(event);
				break;

			case "reloadStart":
				this.proxy.onReloadStart(event);
				break;

			case "reloadComplete":
				this.proxy.onReloadComplete(event);
				this.emit("reloadComplete", event);
				break;

			case "previewTokenExpired":
				this.runtime.onPreviewTokenExpired(event);
				break;
		}
	}

	private handleErrorEvent(event: ErrorEvent): void {
		if (
			event.cause instanceof MiniflareCoreError &&
			event.cause.isUserError()
		) {
			this.emit(
				"error",
				new UserError(event.cause.message, {
					telemetryMessage: "api dev miniflare user error",
				})
			);
		} else if (
			event.source === "ProxyController" &&
			event.reason.startsWith("Failed to send message to")
		) {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		}
		// if other knowable + recoverable errors occur, handle them here
		else {
			// otherwise, re-emit the unknowable errors to the top-level
			this.emit("error", event);
		}
	}

	async teardown() {
		logger.debug("DevEnv teardown beginning...");

		await Promise.all([
			this.config.teardown(),
			this.bundler.teardown(),
			this.runtime.teardown(),
			this.proxy.teardown(),
		]);

		logger.debug("DevEnv teardown complete");
	}
}

function createWorkerObject(devEnv: DevEnv): Worker {
	return {
		get ready() {
			return devEnv.proxy.ready.promise.then(() => undefined);
		},
		get url() {
			return devEnv.proxy.ready.promise.then((ev) => ev.url);
		},
		patchConfig(config) {
			return devEnv.config.patch(config);
		},
		async dispose() {
			await devEnv.teardown();
		},
		raw: devEnv,
	};
}
