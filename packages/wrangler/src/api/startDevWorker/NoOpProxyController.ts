import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

import { ProxyController } from "./ProxyController";

export class NoOpProxyController extends ProxyController {
	onConfigUpdate(_data: ConfigUpdateEvent) {}
	onBundleStart(_data: BundleStartEvent) {}
	onReloadStart(_data: ReloadStartEvent) {}
	onReloadComplete(_data: ReloadCompleteEvent) {}
}
