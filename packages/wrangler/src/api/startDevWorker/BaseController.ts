import { EventEmitter } from "node:events";
import { logger } from "../../logger";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	DevRegistryUpdateEvent,
	ErrorEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";

interface TypedEventEmitter<EventMap extends Record<string | symbol, unknown[]>>
	extends EventEmitter {
	addListener<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	on<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	once<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	removeListener<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	off<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	removeAllListeners(event?: keyof EventMap): this;
	listeners<Name extends keyof EventMap>(
		eventName: Name
	): ((...args: EventMap[Name]) => void)[];
	rawListeners<Name extends keyof EventMap>(
		eventName: Name
	): ((...args: EventMap[Name]) => void)[];
	emit<Name extends keyof EventMap>(
		eventName: Name,
		...args: EventMap[Name]
	): boolean;
	listenerCount<Name extends keyof EventMap>(
		eventName: Name,
		listener?: (...args: EventMap[Name]) => void
	): number;
	prependListener<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
	prependOnceListener<Name extends keyof EventMap>(
		eventName: Name,
		listener: (...args: EventMap[Name]) => void
	): this;
}

const TypedEventEmitterImpl = EventEmitter as unknown as {
	new <
		EventMap extends Record<string | symbol, unknown[]>,
	>(): TypedEventEmitter<EventMap>;
};

export type ControllerEventMap = {
	error: [ErrorEvent];
};
export abstract class Controller<
	EventMap extends ControllerEventMap = ControllerEventMap,
> extends TypedEventEmitterImpl<EventMap> {
	#tearingDown = false;
	async teardown(): Promise<void> {
		this.#tearingDown = true;
	}
	emitErrorEvent(event: ErrorEvent) {
		if (this.#tearingDown) {
			logger.debug("Suppressing error event during teardown");
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
			return;
		}
		this.emit("error", event);
	}
}

type RuntimeControllerEventMap = ControllerEventMap & {
	reloadStart: [ReloadStartEvent];
	reloadComplete: [ReloadCompleteEvent];
	devRegistryUpdate: [DevRegistryUpdateEvent];
};
export abstract class RuntimeController extends Controller<RuntimeControllerEventMap> {
	// ******************
	//   Event Handlers
	// ******************

	abstract onBundleStart(_: BundleStartEvent): void;
	abstract onBundleComplete(_: BundleCompleteEvent): void;
	abstract onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void;

	// *********************
	//   Event Dispatchers
	// *********************

	abstract emitReloadStartEvent(data: ReloadStartEvent): void;
	abstract emitReloadCompleteEvent(data: ReloadCompleteEvent): void;
}
