import assert from "node:assert";
import { EventEmitter } from "node:events";
import { ParseError, UserError } from "@cloudflare/workers-utils";
import { MiniflareCoreError } from "miniflare";
import { logger, runWithLogLevel } from "../../logger";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { LocalRuntimeController } from "./LocalRuntimeController";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type {
	Controller,
	ControllerBus,
	ControllerEvent,
	RuntimeController,
} from "./BaseController";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerInput, Worker } from "./types";

type ControllerFactory<C extends Controller> = (devEnv: DevEnv) => C;

export class DevEnv extends EventEmitter implements ControllerBus {
	config: ConfigController;
	bundler: BundlerController;
	runtimes: RuntimeController[];
	proxy: ProxyController;

	async startWorker(options: StartDevWorkerInput): Promise<Worker> {
		const worker = createWorkerObject(this);

		try {
			await this.config.set(options, true);
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

	constructor({
		configFactory = (devEnv) => new ConfigController(devEnv),
		bundlerFactory = (devEnv) => new BundlerController(devEnv),
		runtimeFactories = [
			(devEnv) => new LocalRuntimeController(devEnv),
			(devEnv) => new RemoteRuntimeController(devEnv),
		],
		proxyFactory = (devEnv) => new ProxyController(devEnv),
	}: {
		configFactory?: ControllerFactory<ConfigController>;
		bundlerFactory?: ControllerFactory<BundlerController>;
		runtimeFactories?: ControllerFactory<RuntimeController>[];
		proxyFactory?: ControllerFactory<ProxyController>;
	} = {}) {
		super();

		this.config = configFactory(this);
		this.bundler = bundlerFactory(this);
		this.runtimes = runtimeFactories.map((factory) => factory(this));
		this.proxy = proxyFactory(this);

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
	 * - RuntimeController emits devRegistryUpdate → ConfigController
	 * - ProxyController emits previewTokenExpired → RuntimeControllers
	 * - Any controller emits error → DevEnv error handler
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
				this.runtimes.forEach((runtime) => {
					runtime.onBundleStart(event);
				});
				break;

			case "bundleComplete":
				this.runtimes.forEach((runtime) => {
					runtime.onBundleComplete(event);
				});
				break;

			case "reloadStart":
				this.proxy.onReloadStart(event);
				break;

			case "reloadComplete":
				this.proxy.onReloadComplete(event);
				break;

			case "devRegistryUpdate":
				this.config.onDevRegistryUpdate(event);
				break;

			case "previewTokenExpired":
				this.runtimes.forEach((runtime) => {
					runtime.onPreviewTokenExpired(event);
				});
				break;

			default: {
				const _exhaustive: never = event;
				logger.warn(
					`Unknown event type: ${(_exhaustive as ControllerEvent).type}`
				);
			}
		}
	}

	private handleErrorEvent(event: ErrorEvent): void {
		if (
			event.cause instanceof MiniflareCoreError &&
			event.cause.isUserError()
		) {
			this.emit("error", new UserError(event.cause.message));
		} else if (
			event.source === "ProxyController" &&
			(event.reason.startsWith("Failed to send message to") ||
				event.reason.startsWith("Could not connect to InspectorProxyWorker"))
		) {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		}
		// Parse errors are recoverable by changing your Wrangler configuration file and saving
		// All other errors from the ConfigController are non-recoverable
		else if (
			event.source === "ConfigController" &&
			event.cause instanceof ParseError
		) {
			logger.error(event.cause);
		}
		// if other knowable + recoverable errors occur, handle them here
		else {
			// otherwise, re-emit the unknowable errors to the top-level
			this.emit("error", event);
		}
	}

	async teardown() {
		await runWithLogLevel(this.config.latestInput?.dev?.logLevel, async () => {
			logger.debug("DevEnv teardown beginning...");

			await Promise.all([
				this.config.teardown(),
				this.bundler.teardown(),
				...this.runtimes.map((runtime) => runtime.teardown()),
				this.proxy.teardown(),
			]);

			this.emit("teardown");

			logger.debug("DevEnv teardown complete");
		});
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
		get inspectorUrl() {
			return devEnv.proxy.ready.promise.then((ev) => ev.inspectorUrl);
		},
		get config() {
			assert(devEnv.config.latestConfig);
			return devEnv.config.latestConfig;
		},
		async setConfig(config, throwErrors) {
			return devEnv.config.set(config, throwErrors);
		},
		patchConfig(config) {
			return devEnv.config.patch(config);
		},
		async fetch(...args) {
			const { proxyWorker } = await devEnv.proxy.ready.promise;
			await devEnv.proxy.runtimeMessageMutex.drained();

			return proxyWorker.dispatchFetch(...args);
		},
		async queue(...args) {
			assert(
				this.config.name,
				"Worker name must be defined to use `Worker.queue()`"
			);
			const { proxyWorker } = await devEnv.proxy.ready.promise;
			const w = await proxyWorker.getWorker(this.config.name);
			return w.queue(...args);
		},
		async scheduled(...args) {
			assert(
				this.config.name,
				"Worker name must be defined to use `Worker.scheduled()`"
			);
			const { proxyWorker } = await devEnv.proxy.ready.promise;
			const w = await proxyWorker.getWorker(this.config.name);
			return w.scheduled(...args);
		},
		async dispose() {
			await devEnv.proxy.ready.promise.finally(() => devEnv.teardown());
		},
		raw: devEnv,
	};
}
