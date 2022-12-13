import { ValueOf } from "./types";

export type TypedEventListener<E extends Event> =
	| ((e: E) => void)
	| { handleEvent(e: E): void };

export class TypedEventTarget<
	EventMap extends Record<string, Event>,
> extends EventTarget {
	addEventListener<Type extends keyof EventMap>(
		type: Type,
		listener: TypedEventListener<EventMap[Type]> | null,
		options?: AddEventListenerOptions | boolean
	): void {
		super.addEventListener(
			type as string,
			listener as EventListenerOrEventListenerObject,
			options
		);
	}

	removeEventListener<Type extends keyof EventMap>(
		type: Type,
		listener: TypedEventListener<EventMap[Type]> | null,
		options?: EventListenerOptions | boolean
	): void {
		super.removeEventListener(
			type as string,
			listener as EventListenerOrEventListenerObject,
			options
		);
	}

	dispatchEvent(event: ValueOf<EventMap>): boolean {
		return super.dispatchEvent(event);
	}
}
