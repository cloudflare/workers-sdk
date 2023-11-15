import { RuntimeController } from "./BaseController";
import { notImplemented } from "./NotImplementedError";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export class RemoteRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	onBundleStart(_: BundleStartEvent) {
		notImplemented(this.onBundleStart.name, this.constructor.name);
	}
	onBundleComplete(_: BundleCompleteEvent) {
		notImplemented(this.onBundleComplete.name, this.constructor.name);
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		notImplemented(this.onPreviewTokenExpired.name, this.constructor.name);
	}

	async teardown() {
		notImplemented(this.teardown.name, this.constructor.name);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
