import { EventEmitter } from "node:events";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ErrorEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export abstract class Controller extends EventEmitter {}

export abstract class RuntimeController extends Controller {
	// ******************
	//   Event Handlers
	// ******************

	abstract onBundleStart(_: BundleStartEvent): void;
	abstract onBundleComplete(_: BundleCompleteEvent): void;
	abstract onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void;
	abstract teardown(): Promise<void>;

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
