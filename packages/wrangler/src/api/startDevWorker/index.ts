import { EventEmitter } from "node:events";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
	ErrorEvent,
	PreviewTokenExpiredEvent,
	ReadyEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
	TeardownEvent,
	WorkerConfig,
} from "./events";
import type { StartDevWorkerOptions, DevWorker } from "./types";

export function startDevWorker(options: StartDevWorkerOptions): DevWorker {
	const devEnv = new DevEnv();

	devEnv.config.setOptions(options);

	return devEnv.worker;
}

export class DevEnv extends EventEmitter {
	config: ConfigController;
	bundler: BundlerController;
	runtimes: RuntimeController[];
	proxy: ProxyController;

	#worker?: DevWorker;
	get worker(): DevWorker {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const devEnv = this;
		return (this.#worker ??= {
			get ready() {
				return devEnv.proxy.ready.then(() => undefined);
			},
			get config() {
				return devEnv.config.config;
			},
			setOptions(options) {
				devEnv.config.setOptions(options);
			},
			updateOptions(options) {
				devEnv.config.updateOptions(options);
			},
			async fetch(...args) {
				const { worker } = await devEnv.proxy.ready;
				return worker.fetch(...args);
			},
			async queue(...args) {
				const { worker } = await devEnv.proxy.ready;
				return worker.queue(...args);
			},
			async scheduled(...args) {
				const { worker } = await devEnv.proxy.ready;
				return worker.scheduled(...args);
			},
			async dispose() {
				await devEnv.teardown({} as TeardownEvent);
			},
		});
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

		config.on("configUpdate", (event) => {
			bundler.onConfigUpdate(event);
		});
		config.once("configUpdate", (event) => {
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
				bundler.onConfigUpdate(event);
			});
			runtime.on("reloadComplete", (event) => {
				bundler.onConfigUpdate(event);
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

	async teardown(data: TeardownEvent) {
		this.emit("teardown", data);

		await Promise.all([
			this.config.teardown(data),
			this.bundler.teardown(data),
			this.runtimes.forEach((runtime) => runtime.teardown(data)),
			this.proxy.teardown(data),
		]);
	}

	emitErrorEvent(data: ErrorEvent) {
		this.emit("error", data);
	}
}

export class ConfigController extends EventEmitter {
	config?: WorkerConfig;

	setOptions(_: StartDevWorkerOptions) {
		throw new NotImplementedError(this.setOptions.name, this.constructor.name);
	}
	updateOptions(_: Partial<StartDevWorkerOptions>) {
		throw new NotImplementedError(
			this.updateOptions.name,
			this.constructor.name
		);
	}

	// ******************
	//   Event Handlers
	// ******************

	async teardown(_: TeardownEvent) {
		throw new NotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitConfigUpdateEvent(data: ConfigUpdateEvent) {
		this.emit("configUpdate", data);
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "configUpdate", listener: (_: ConfigUpdateEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
}

export class BundlerController extends EventEmitter {
	// ******************
	//   Event Handlers
	// ******************

	onConfigUpdate(_: ConfigUpdateEvent) {
		throw new NotImplementedError(
			this.onConfigUpdate.name,
			this.constructor.name
		);
	}

	async teardown(_: TeardownEvent) {
		throw new NotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitBundleStartEvent(data: BundleStartEvent) {
		this.emit("bundleStart", data);
	}
	emitBundleCompletetEvent(data: BundleCompleteEvent) {
		this.emit("bundleComplete", data);
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "bundleStart", listener: (_: BundleStartEvent) => void): this;
	on(event: "bundleComplete", listener: (_: BundleCompleteEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}

export abstract class RuntimeController extends EventEmitter {
	// ******************
	//   Event Handlers
	// ******************

	abstract onBundleStart(_: BundleStartEvent): void;
	abstract onBundleComplete(_: BundleCompleteEvent): void;
	abstract onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void;
	abstract teardown(_: TeardownEvent): Promise<void>;

	// *********************
	//   Event Dispatchers
	// *********************

	abstract emitReloadStartEvent(data: ReloadStartEvent): void;
	abstract emitReloadCompletetEvent(data: ReloadCompleteEvent): void;

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "reloadStart", listener: (_: ReloadStartEvent) => void): this;
	on(event: "reloadComplete", listener: (_: ReloadCompleteEvent) => void): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}
export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		throw new NotImplementedError(
			this.onBundleStart.name,
			this.constructor.name
		);
	}
	onBundleComplete(_: BundleStartEvent) {
		throw new NotImplementedError(
			this.onBundleComplete.name,
			this.constructor.name
		);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// ignore in local runtime
	}

	async teardown(_: TeardownEvent) {
		throw new NotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadComplete", data);
	}
	emitReloadCompletetEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
export class RemoteRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		throw new NotImplementedError(
			this.onBundleStart.name,
			this.constructor.name
		);
	}
	onBundleComplete(_: BundleCompleteEvent) {
		throw new NotImplementedError(
			this.onBundleComplete.name,
			this.constructor.name
		);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		throw new NotImplementedError(
			this.onPreviewTokenExpired.name,
			this.constructor.name
		);
	}

	async teardown(_: TeardownEvent) {
		throw new NotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadComplete", data);
	}
	emitReloadCompletetEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}

export class ProxyController extends EventEmitter {
	#readyResolver!: (_: ReadyEvent) => void;
	public ready: Promise<ReadyEvent> = new Promise((resolve) => {
		this.#readyResolver = resolve;
	});

	// ******************
	//   Event Handlers
	// ******************

	onConfigUpdate(_: ConfigUpdateEvent) {
		throw new NotImplementedError(
			this.onConfigUpdate.name,
			this.constructor.name
		);
	}
	onBundleStart(_: BundleStartEvent) {
		throw new NotImplementedError(
			this.onBundleStart.name,
			this.constructor.name
		);
	}
	onReloadStart(_: ReloadStartEvent) {
		throw new NotImplementedError(
			this.onReloadStart.name,
			this.constructor.name
		);
	}
	onReloadComplete(_: ReloadCompleteEvent) {
		throw new NotImplementedError(
			this.onReloadComplete.name,
			this.constructor.name
		);
	}

	async teardown(_: TeardownEvent) {
		throw new NotImplementedError(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReadyEvent(data: ReadyEvent) {
		this.emit("ready", data);
		this.#readyResolver(data);
	}
	emitPreviewTokenExpiredEvent(data: PreviewTokenExpiredEvent) {
		this.emit("previewTokenExpired", data);
	}

	// *********************
	//   Event Subscribers
	// *********************

	on(event: "ready", listener: (_: ReadyEvent) => void): this;
	on(
		event: "previewTokenExpired",
		listener: (_: PreviewTokenExpiredEvent) => void
	): this;
	// @ts-expect-error Missing overload implementation (only need the signature types, base implementation is fine)
	on(event: "error", listener: (_: ErrorEvent) => void): this;
	// @ts-expect-error Missing initialisation (only need the signature types, base implementation is fine)
	once: typeof this.on;
}

class NotImplementedError extends Error {
	constructor(func: string, namespace?: string) {
		if (namespace) func = `${namespace}#${func}`;
		super(`Not Implemented Error: ${func}`);
	}
}
