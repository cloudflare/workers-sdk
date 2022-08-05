import { TypedEventTarget } from "./typed-event";
import type { TypedEventListener, TypedEvent } from "./typed-event";
import type { EventListener } from "node:events";

/**
 * `CommandSession`s are strongly-typed `EventTarget`s, which can be used to
 * interact with long-running commands.
 */
export abstract class CommandSession<
	EventMap extends Record<string, Record<string, unknown>> = Record<
		string,
		never
	>
> extends TypedEventTarget<EventMap> {
	constructor() {
		super();
	}

	public addEventListener<K extends keyof EventMap>(
		type: K extends string ? K : never,
		listener: TypedEventListener<K extends string ? K : never, EventMap[K]>
	) {
		return super.addEventListener(type, listener as EventListener);
	}

	public removeEventListener<K extends keyof EventMap>(
		type: K extends string ? K : never,
		listener: TypedEventListener<K extends string ? K : never, EventMap[K]>
	) {
		return super.removeEventListener(type, listener as EventListener);
	}

	public dispatchEvent<K extends keyof EventMap>(
		event: TypedEvent<K extends string ? K : never, EventMap[K]>
	) {
		return super.dispatchEvent(event);
	}

	abstract initialize(): Promise<void>;
	abstract dispose(): Promise<void>;
}

/**
 * Create a new `CommandSession` for long-running processes
 */
export function session<
	EventMap extends Record<string, Record<string, unknown>> = Record<
		string,
		never
	>
>({
	initialize,
	dispose,
}: Record<
	"initialize" | "dispose",
	(target: TypedEventTarget<EventMap>) => Promise<void>
>): CommandSession<EventMap> {
	return new (class extends CommandSession<EventMap> {
		async initialize(): Promise<void> {
			return await initialize(this);
		}

		async dispose(): Promise<void> {
			return await dispose(this);
		}
	})();
}
