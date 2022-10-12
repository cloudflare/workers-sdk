import { EventTarget, Event } from "node:events";
import type { EventListener } from "node:events";

type TypedEvent<Type extends string, Payload> = Omit<Event, "type"> & {
	type: Type;
} & Payload;

abstract class TypedEventBase<Type extends string, Payload> extends Event {
	constructor(
		type: Type,
		payload: Payload,
		options?: { bubbles?: false; cancelable?: boolean; composed?: false }
	) {
		super(type, options);
		Object.assign(this, payload);
	}
}

type EventMap<EventList extends Event[]> = {
	[eventType in EventList[number]["type"]]: unknown;
};

type TypedEventListener<Type extends string, Payload> =
	| ((event: TypedEvent<Type, Payload>) => void | Promise<void>)
	| { handleEvent: (event: TypedEvent<Type, Payload>) => void | Promise<void> };

export class TypedEventTarget<
	EventList extends Event[],
	M extends EventMap<EventList>
> extends EventTarget {
	constructor() {
		super();
	}

	public addEventListener<K extends keyof M & string>(
		type: K,
		listener: TypedEventListener<K, M[K]>,
		options?: {
			once?: boolean;
			passive?: boolean;
			capture?: boolean;
		}
	): void {
		return super.addEventListener(
			type,
			listener as unknown as EventListener,
			options
		);
	}

	public removeEventListener<K extends keyof M & string>(
		type: K,
		listener: TypedEventListener<K, M[K]>,
		options?: {
			capture?: boolean;
		}
	): void {
		return super.removeEventListener(
			type,
			listener as unknown as EventListener,
			options
		);
	}

	public dispatchEvent<E extends EventList[number]>(event: E): boolean {
		return super.dispatchEvent(event);
	}
}

// function b() {
// 	let ws = new WebSocket("blah");
// 	ws.on;
// }
