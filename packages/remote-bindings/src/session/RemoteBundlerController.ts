import proxyServerWorker from "worker:remote-bindings/ProxyServerWorker.ts";
import { Controller } from "../internal/dev-env/BaseController";
import type { ControllerBus } from "../internal/dev-env/BaseController";
import type { ConfigUpdateEvent } from "../internal/dev-env/events";
import type { Bundle } from "../internal/dev-env/types";

export class RemoteBundlerController extends Controller {
	#bundleId = 0;

	constructor(bus: ControllerBus) {
		super(bus);
	}

	onConfigUpdate({ config }: ConfigUpdateEvent): void {
		this.bus.dispatch({ type: "bundleStart", config });
		const bundle: Bundle = {
			id: ++this.#bundleId,
			path: "ProxyServerWorker.mjs",
			entrypointSource: proxyServerWorker,
			entry: {
				file: "ProxyServerWorker.mjs",
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			type: "esm",
			modules: [],
			dependencies: {},
			sourceMapPath: undefined,
			sourceMapMetadata: undefined,
		};
		this.bus.dispatch({ type: "bundleComplete", config, bundle });
	}
}
