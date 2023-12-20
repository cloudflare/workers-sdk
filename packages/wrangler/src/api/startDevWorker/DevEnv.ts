import assert from "node:assert";
import { EventEmitter } from "node:events";
import { logger } from "../../logger";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { LocalRuntimeController } from "./LocalRuntimeController";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { RuntimeController } from "./BaseController";
import type { Controller } from "./BaseController";
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

		const controllers: Controller[] = [config, bundler, ...runtimes, proxy];
		controllers.forEach((controller) => {
			controller.on("error", (event: ErrorEvent) => this.emitErrorEvent(event));
		});

		this.on("error", (event: ErrorEvent) => {
			// TODO: when we're are comfortable with StartDevWorker/DevEnv stability,
			//       we can remove this handler and let the user handle the unknowable errors
			//       or let the process crash. For now, log them to stderr
			//       so we can identify knowable vs unknowable error candidates

			logger.error(`Error in ${event.source}: ${event.reason}\n`, event.cause);
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
			...this.runtimes.map((runtime) => runtime.teardown()),
			this.proxy.teardown(),
		]);
	}

	emitErrorEvent(ev: ErrorEvent) {
		if (
			ev.source === "ProxyController" &&
			ev.reason === "Failed to start ProxyWorker or InspectorProxyWorker"
		) {
			assert(ev.data.config); // we must already have a `config` if we've already tried (and failed) to instantiate the ProxyWorker(s)

			const { config } = ev.data;
			const port = config.dev?.server?.port;
			const inspectorPort = config.dev?.inspector?.port;
			const randomPorts = [0, undefined];

			// console.log({ port, inspectorPort, ev });
			if (!randomPorts.includes(port) || !randomPorts.includes(inspectorPort)) {
				// emit the event here while the ConfigController is unimplemented
				// this will cause the ProxyController to try reinstantiating the ProxyWorker(s)
				// TODO: change this to `this.config.updateOptions({ dev: { server: { port: 0 }, inspector: { port: 0 } } });` when the ConfigController is implemented
				this.config.emitConfigUpdateEvent({
					type: "configUpdate",
					config: {
						...config,
						dev: {
							...config.dev,
							server: { ...config.dev?.server, port: 0 }, // override port
							inspector: { ...config.dev?.inspector, port: 0 }, // override port
						},
					},
				});
			}
		} else if (
			ev.source === "ProxyController" &&
			(ev.reason.startsWith("Failed to send message to") ||
				ev.reason.startsWith("Could not connect to InspectorProxyWorker"))
		) {
			logger.debug(`Error in ${ev.source}: ${ev.reason}\n`, ev.cause);
			logger.debug("=> Error contextual data:", ev.data);
		}
		// if other knowable + recoverable errors occur, handle them here
		else {
			// otherwise, re-emit the unknowable errors to the top-level
			this.emit("error", ev);
		}
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
			await devEnv.proxy.runtimeMessageMutex.drained();

			return proxyWorker.dispatchFetch(...args);
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
