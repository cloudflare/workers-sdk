import { EventEmitter } from "node:events";
import { fetch, Request, type RequestInit } from "miniflare";
import { logger } from "../../logger";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { LocalRuntimeController } from "./LocalRuntimeController";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { RuntimeController } from "./BaseController";
import type { ErrorEvent } from "./events";
import type { StartDevWorkerOptions, DevWorker } from "./types";

/**
 * @internal
 */
export class DevEnv extends EventEmitter {
	config: ConfigController;
	bundler: BundlerController;
	runtimes: RuntimeController[];
	proxy: ProxyController;

	startWorker(options: StartDevWorkerOptions): DevWorker {
		const worker = createWorkerObject(this);

		this.config.setOptions(options);

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

		[config, bundler, ...runtimes, proxy].forEach((controller) =>
			controller.on("error", (event) => this.emitErrorEvent(event))
		);

		this.on("error", (event) => {
			logger.error(event);
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
		this.emit("teardown");

		await Promise.all([
			this.config.teardown(),
			this.bundler.teardown(),
			this.runtimes.forEach((runtime) => runtime.teardown()),
			this.proxy.teardown(),
		]);
	}

	emitErrorEvent(data: ErrorEvent) {
		this.emit("error", data);
	}
}

export function createWorkerObject(devEnv: DevEnv): DevWorker {
	return {
		get ready() {
			return devEnv.proxy.ready.promise.then(() => undefined);
		},
		get config() {
			return devEnv.config.config;
		},
		setOptions(options) {
			return devEnv.config.setOptions(options);
		},
		updateOptions(options) {
			return devEnv.config.updateOptions(options);
		},
		async fetch(...args) {
			const { proxyWorker } = await devEnv.proxy.ready.promise;
			// return proxyWorker.dispatchFetch(...args);
			// ^ bug: Miniflare#dispatchFetch uses one HTTP/1.1 connection, preventing parallel requests (pause/play requests + buffered eyeball requests)
			// workaround: use undici.fetch
			const proxyWorkerUrl = await proxyWorker.ready;
			const req = new Request(...args);
			const url = new URL(req.url);
			url.protocol = proxyWorkerUrl.protocol;
			url.hostname = proxyWorkerUrl.hostname;
			url.port = proxyWorkerUrl.port;
			// /workaround

			return fetch(url, req as RequestInit);
		},
		async queue(..._args) {
			// const { worker } = await devEnv.proxy.ready;
			// return worker.queue(...args);
		},
		async scheduled(..._args) {
			// const { worker } = await devEnv.proxy.ready;
			// return worker.scheduled(...args);
		},
		async dispose() {
			await devEnv.teardown();
		},
	};
}
