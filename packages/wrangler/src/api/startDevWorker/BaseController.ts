import { logger } from "../../logger";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	ConfigUpdateEvent,
	DevRegistryUpdateEvent,
	ErrorEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export type ControllerEvent =
	| ErrorEvent
	| ConfigUpdateEvent
	| BundleStartEvent
	| BundleCompleteEvent
	| ReloadStartEvent
	| ReloadCompleteEvent
	| DevRegistryUpdateEvent
	| PreviewTokenExpiredEvent;

export interface ControllerBus {
	dispatch(event: ControllerEvent): void;
}

export abstract class Controller {
	protected bus: ControllerBus;
	#tearingDown = false;

	constructor(bus: ControllerBus) {
		this.bus = bus;
	}

	async teardown(): Promise<void> {
		this.#tearingDown = true;
	}

	protected emitErrorEvent(event: ErrorEvent) {
		if (this.#tearingDown) {
			logger.debug("Suppressing error event during teardown");
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
			return;
		}

		this.bus.dispatch(event);
	}
}

export abstract class RuntimeController extends Controller {
	// ******************
	//   Event Handlers
	// ******************

	abstract onBundleStart(_: BundleStartEvent): void;
	abstract onBundleComplete(_: BundleCompleteEvent): void;
	abstract onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void;

	// *********************
	//   Event Dispatchers
	// *********************

	protected emitReloadStartEvent(data: ReloadStartEvent): void {
		this.bus.dispatch(data);
	}

	protected emitReloadCompleteEvent(data: ReloadCompleteEvent): void {
		this.bus.dispatch(data);
	}

	protected emitDevRegistryUpdateEvent(data: DevRegistryUpdateEvent): void {
		this.bus.dispatch(data);
	}
}
