import { logger } from "../../logger";
import type { DevEnv } from "./DevEnv";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	DevRegistryUpdateEvent,
	ErrorEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

export abstract class Controller {
	protected devEnv!: DevEnv;
	#tearingDown = false;

	constructor(devEnv?: DevEnv) {
		if (devEnv) {
			this.devEnv = devEnv;
		}
	}

	setDevEnv(devEnv: DevEnv): void {
		this.devEnv = devEnv;
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
		this.devEnv.dispatch(event);
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
		this.devEnv.dispatch(data);
	}

	protected emitReloadCompleteEvent(data: ReloadCompleteEvent): void {
		this.devEnv.dispatch(data);
	}

	protected emitDevRegistryUpdateEvent(data: DevRegistryUpdateEvent): void {
		this.devEnv.dispatch(data);
	}
}
