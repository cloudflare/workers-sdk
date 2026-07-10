import assert from "node:assert";
import { EventEmitter } from "node:events";
import type {
	ControllerBus,
	ControllerContext,
	ControllerEvent,
	RuntimeController,
} from "./BaseController";
import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	DevRegistryUpdateEvent,
	ErrorEvent,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type {
	LogLevel,
	StartDevWorkerInput,
	StartDevWorkerOptions,
	Worker,
} from "./types";
import type { DeferredPromise } from "./utils";

export type ControllerFactory<C> = (devEnv: DevEnv) => C;

interface ControllerLike {
	teardown(): Promise<void>;
}

export interface ConfigControllerLike extends ControllerLike {
	latestInput?: StartDevWorkerInput;
	latestConfig?: StartDevWorkerOptions;
	set(
		input: StartDevWorkerInput,
		throwErrors?: boolean
	): Promise<StartDevWorkerOptions | undefined>;
	patch(
		input: Partial<StartDevWorkerInput>
	): Promise<StartDevWorkerOptions | undefined>;
	onDevRegistryUpdate(event: DevRegistryUpdateEvent): void;
}

export interface BundlerControllerLike extends ControllerLike {
	onConfigUpdate(event: ConfigUpdateEvent): void;
}

export interface ProxyControllerLike extends ControllerLike {
	ready: DeferredPromise<ReadyEvent>;
	localServerReady: DeferredPromise<void>;
	runtimeMessageMutex: { drained(): Promise<void> };
	proxyWorker?: ReadyEvent["proxyWorker"];
	onConfigUpdate(event: ConfigUpdateEvent): void;
	onBundleStart(event: BundleStartEvent): void;
	onReloadStart(event: ReloadStartEvent): void;
	onReloadComplete(event: ReloadCompleteEvent): void;
}

export interface DevEnvContext {
	logger: ControllerContext["logger"] & {
		warn(message: string, ...args: unknown[]): void;
	};
	initialize(): void;
	handleErrorEvent(devEnv: DevEnv, event: ErrorEvent): void;
	runWithLogLevel<V>(logLevel: LogLevel | undefined, callback: () => V): V;
}

export interface DevEnvOptions {
	configFactory: ControllerFactory<ConfigControllerLike>;
	bundlerFactory: ControllerFactory<BundlerControllerLike>;
	runtimeFactories: ControllerFactory<RuntimeController>[];
	proxyFactory: ControllerFactory<ProxyControllerLike>;
	context: DevEnvContext;
}

export class DevEnv extends EventEmitter implements ControllerBus {
	config: ConfigControllerLike;
	bundler: BundlerControllerLike;
	runtimes: RuntimeController[];
	proxy: ProxyControllerLike;
	controllerContext: ControllerContext;
	private context: DevEnvContext;

	async startWorker(options: StartDevWorkerInput): Promise<Worker> {
		this.context.initialize();

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
		configFactory,
		bundlerFactory,
		runtimeFactories,
		proxyFactory,
		context,
	}: DevEnvOptions) {
		super();

		this.context = context;
		this.controllerContext = context;
		this.config = configFactory(this);
		this.bundler = bundlerFactory(this);
		this.runtimes = runtimeFactories.map((factory) => factory(this));
		this.proxy = proxyFactory(this);

		this.on("error", (event: ErrorEvent) => {
			this.context.logger.debug(
				`Error in ${event.source}: ${event.reason}\n`,
				event.cause
			);
			this.context.logger.debug("=> Error contextual data:", event.data);
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
	 *
	 * `reloadComplete` is also re-emitted as an external EventEmitter event
	 * (`devEnv.on("reloadComplete", ...)`) so callers like
	 * `RemoteProxySession.updateBindings` can wait for the reload to finish.
	 */
	dispatch(event: ControllerEvent): void {
		switch (event.type) {
			case "error":
				this.context.handleErrorEvent(this, event);
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
				this.emit("reloadComplete", event);
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
				this.context.logger.warn(
					`Unknown event type: ${(_exhaustive as ControllerEvent).type}`
				);
			}
		}
	}

	async teardown() {
		await this.context.runWithLogLevel(
			this.config.latestInput?.dev?.logLevel,
			async () => {
				this.context.logger.debug("DevEnv teardown beginning...");

				await Promise.all([
					this.config.teardown(),
					this.bundler.teardown(),
					...this.runtimes.map((runtime) => runtime.teardown()),
					this.proxy.teardown(),
				]);

				this.emit("teardown");

				this.context.logger.debug("DevEnv teardown complete");
			}
		);
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
