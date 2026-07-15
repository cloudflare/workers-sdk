import { ProxyController } from "./ProxyController";
import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export class NoOpProxyController extends ProxyController {
	onConfigUpdate(_data: ConfigUpdateEvent) {}
	onBundleStart(_data: BundleStartEvent) {}
	onReloadStart(_data: ReloadStartEvent) {}
	onReloadComplete(_data: ReloadCompleteEvent) {}
}
