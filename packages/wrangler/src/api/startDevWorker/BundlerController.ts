import { Controller } from "./BaseController";
import { notImplemented } from "./NotImplementedError";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
	ErrorEvent,
} from "./events";

export class BundlerController extends Controller {
	// ******************
	//   Event Handlers
	// ******************

	onConfigUpdate(_: ConfigUpdateEvent) {
		notImplemented(this.onConfigUpdate.name, this.constructor.name);
	}

	async teardown() {
		notImplemented(this.teardown.name, this.constructor.name);
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
