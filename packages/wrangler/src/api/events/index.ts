export { LogEvent } from "./log";
export { MetricsEvent } from "./metrics";

import { EventTarget } from "node:events";
import { Event } from "node:events";
import type { EventListener } from "node:events";

export class TypedEvent<T extends string> extends Event {
	constructor(
		type: T,
		options?: { bubbles?: false; cancelable?: boolean; composed?: false }
	) {
		super(type, options);
	}
}

type EventListenerFunction<T extends string, E extends TypedEvent<T>> = (
	event: E
) => void | Promise<void>;

type TypedEventListener<T extends string, E extends TypedEvent<T>> =
	| EventListenerFunction<T, E>
	| {
			handleEvent: EventListenerFunction<T, E>;
	  };

export class TypedEventTarget<Events extends TypedEvent<string>> {
	private inner: EventTarget;

	constructor() {
		this.inner = new EventTarget();
	}

	public addEventListener<T extends Events>(
		event: T["type"],
		listener: TypedEventListener<T["type"], T>,
		options?: {
			once?: boolean | undefined;
			passive?: boolean | undefined;
			capture?: boolean | undefined;
		}
	) {
		return this.inner.addEventListener(
			event,
			listener as EventListener,
			options
		);
	}

	public removeEventListener<T extends Events>(
		event: T["type"],
		listener: TypedEventListener<T["type"], T>,
		options?: {
			capture?: boolean | undefined;
		}
	) {
		return this.inner.removeEventListener(
			event,
			listener as EventListener,
			options
		);
	}

	public dispatchEvent<T extends Events>(event: T) {
		return this.inner.dispatchEvent(event);
	}
}
