import assert from "node:assert";
import { EventEmitter } from "node:events";
import { logger, runWithLogLevel } from "../../logger";
import { formatMessage, ParseError } from "../../parse";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { LocalRuntimeController } from "./LocalRuntimeController";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { Controller, RuntimeController } from "./BaseController";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerInput, Worker } from "./types";

export class DevEnv extends EventEmitter {
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
		config = new ConfigController(),
		bundler = new BundlerController(),
		runtimes = [
			new LocalRuntimeController(),
			new RemoteRuntimeController(),
		] as RuntimeController[],
		proxy = new ProxyController(),
	} = {}) {
		super();

		this.config = config;
		this.bundler = bundler;
		this.runtimes = runtimes;
		this.proxy = proxy;

		const controllers: Controller[] = [config, bundler, ...runtimes, proxy];
		controllers.forEach((controller) => {
			controller.on("error", (event: ErrorEvent) => this.emitErrorEvent(event));
		});

		this.on("error", (event: ErrorEvent) => {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		});

		config.on("configUpdate", (event) => {
			bundler.onConfigUpdate(event);
			proxy.onConfigUpdate(event);
		});

		bundler.on("bundleStart", (event) => {
			proxy.onBundleStart(event);
			runtimes.forEach((runtime) => {
				runtime.onBundleStart(event);
			});
		});
		bundler.on("bundleComplete", (event) => {
			runtimes.forEach((runtime) => {
				runtime.onBundleComplete(event);
			});
		});

		runtimes.forEach((runtime) => {
			runtime.on("reloadStart", (event) => {
				proxy.onReloadStart(event);
			});
			runtime.on("reloadComplete", (event) => {
				proxy.onReloadComplete(event);
			});
			runtime.on("devRegistryUpdate", (event) => {
				config.onDevRegistryUpdate(event);
			});
		});

		proxy.on("previewTokenExpired", (event) => {
			runtimes.forEach((runtime) => {
				runtime.onPreviewTokenExpired(event);
			});
		});
	}

	// *********************
	//   Event Dispatchers
	// *********************

	async teardown() {
		await runWithLogLevel(this.config.latestInput?.dev?.logLevel, async () => {
			logger.debug("DevEnv teardown beginning...");

			await Promise.all([
				this.config.teardown(),
				this.bundler.teardown(),
				...this.runtimes.map((runtime) => runtime.teardown()),
				this.proxy.teardown(),
			]);

			this.config.removeAllListeners();
			this.bundler.removeAllListeners();
			this.runtimes.forEach((runtime) => runtime.removeAllListeners());
			this.proxy.removeAllListeners();

			this.emit("teardown");

			logger.debug("DevEnv teardown complete");
		});
	}

	emitErrorEvent(ev: ErrorEvent) {
		if (
			ev.source === "ProxyController" &&
			(ev.reason.startsWith("Failed to send message to") ||
				ev.reason.startsWith("Could not connect to InspectorProxyWorker"))
		) {
			logger.debug(`Error in ${ev.source}: ${ev.reason}\n`, ev.cause);
			logger.debug("=> Error contextual data:", ev.data);
		}
		// Parse errors are recoverable by changing your Wrangler configuration file and saving
		// All other errors from the ConfigController are non-recoverable
		else if (
			ev.source === "ConfigController" &&
			ev.cause instanceof ParseError
		) {
			logger.log(formatMessage(ev.cause));
		}
		// if other knowable + recoverable errors occur, handle them here
		else {
			// otherwise, re-emit the unknowable errors to the top-level
			this.emit("error", ev);
		}
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
