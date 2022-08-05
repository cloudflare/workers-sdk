import { EventTarget } from "node:events";
import type { EventListener, Event } from "node:events";

export type TypedEvent<
	Type extends string,
	ExtraProperties extends Record<string, unknown> = Record<string, never>
> = Omit<Event, "type"> & { type: Type } & ExtraProperties;
export type TypedEventListener<
	Type extends string,
	ExtraProperties extends Record<string, unknown> = Record<string, never>
> =
	| ((event: TypedEvent<Type, ExtraProperties>) => void | Promise<void>)
	| {
			handleEvent: (
				event: TypedEvent<Type, ExtraProperties>
			) => void | Promise<void>;
	  };
export class TypedEventTarget<
	EventMap extends Record<string, Record<string, unknown>>
> {
	private inner: EventTarget;

	constructor() {
		this.inner = new EventTarget();
	}

	public addEventListener<K extends keyof EventMap>(
		type: K extends string ? K : never,
		listener: TypedEventListener<K extends string ? K : never, EventMap[K]>
	) {
		return this.inner.addEventListener(type, listener as EventListener);
	}

	public removeEventListener<K extends keyof EventMap>(
		type: K extends string ? K : never,
		listener: TypedEventListener<K extends string ? K : never, EventMap[K]>
	) {
		return this.inner.removeEventListener(type, listener as EventListener);
	}

	public dispatchEvent<K extends keyof EventMap>(
		event: TypedEvent<K extends string ? K : never, EventMap[K]>
	) {
		return this.inner.dispatchEvent(event);
	}
}
