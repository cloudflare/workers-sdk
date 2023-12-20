import { Controller } from "./BaseController";
import { notImplemented } from "./NotImplementedError";
import type { ControllerEventMap } from "./BaseController";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
} from "./events";

export type BundlerControllerEventMap = ControllerEventMap & {
	bundleStart: [BundleStartEvent];
	bundleComplete: [BundleCompleteEvent];
};
export class BundlerController extends Controller<BundlerControllerEventMap> {
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
}
