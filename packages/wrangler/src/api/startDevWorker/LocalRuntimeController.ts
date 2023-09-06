// import { readFileSync } from "../../parse";
import { RuntimeController } from "./BaseController";
import { throwNotImplementedError } from "./utils";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		throwNotImplementedError(this.onBundleStart.name, this.constructor.name);
	}
	onBundleComplete(_: BundleCompleteEvent) {
		throwNotImplementedError(this.onBundleComplete.name, this.constructor.name);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// ignore in local runtime
	}

	async teardown() {
		throwNotImplementedError(this.teardown.name, this.constructor.name);
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
