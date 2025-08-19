import { EventEmitter } from "node:events";
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
	emitErrorEvent(data: ErrorEvent) {
		this.emit("error", data);
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
	abstract teardown(): Promise<void>;

	// *********************
	//   Event Dispatchers
	// *********************

	abstract emitReloadStartEvent(data: ReloadStartEvent): void;
	abstract emitReloadCompleteEvent(data: ReloadCompleteEvent): void;
}
