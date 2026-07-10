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
import type { Miniflare } from "miniflare";

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
	controllerContext?: ControllerContext;
}

export interface ControllerContext {
	logger: {
		debug(message: string, ...args: unknown[]): void;
	};
}

const defaultControllerContext: ControllerContext = {
	logger: { debug() {} },
};

export abstract class Controller {
	protected bus: ControllerBus;
	protected logger: ControllerContext["logger"];
	#tearingDown = false;

	constructor(
		bus: ControllerBus,
		context = bus.controllerContext ?? defaultControllerContext
	) {
		this.bus = bus;
		this.logger = context.logger;
	}

	async teardown(): Promise<void> {
		this.#tearingDown = true;
	}

	protected emitErrorEvent(event: ErrorEvent) {
		if (this.#tearingDown) {
			this.logger.debug("Suppressing error event during teardown");
			this.logger.debug(
				`Error in ${event.source}: ${event.reason}\n`,
				event.cause
			);
			this.logger.debug("=> Error contextual data:", event.data);
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
	//   Runtime Accessors
	// *********************
	abstract get mf(): Miniflare | undefined;

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
