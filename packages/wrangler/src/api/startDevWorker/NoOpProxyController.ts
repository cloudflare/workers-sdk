import { ProxyController } from "./WranglerProxyController";
import type {
	BundleStartEvent,
	ConfigUpdateEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "@cloudflare/remote-bindings/internal";

export class NoOpProxyController extends ProxyController {
	onConfigUpdate(_data: ConfigUpdateEvent) {}
	onBundleStart(_data: BundleStartEvent) {}
	onReloadStart(_data: ReloadStartEvent) {}
	onReloadComplete(_data: ReloadCompleteEvent) {}
}
