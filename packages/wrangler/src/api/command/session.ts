import { TypedEventTarget } from "../events";
import type { TypedEvent } from "../events";

/**
 * `CommandSession`s are `EventTarget`s, which can be used to
 * interact with long-running commands. They must be initialized with a call
 * to `initialize` and disposed of with calls to `dispose`
 */
export abstract class CommandSession<
	Events extends TypedEvent<string>
> extends TypedEventTarget<Events> {
	constructor() {
		super();
	}

	abstract initialize(): Promise<void>;
	abstract dispose(): Promise<void>;
}

/**
 * Create a new `CommandSession` for long-running processes
 */
export function session<Events extends TypedEvent<string>>({
	initialize,
	dispose,
}: Record<
	"initialize" | "dispose",
	(target: TypedEventTarget<Events>) => Promise<void>
>): CommandSession<Events> {
	return new (class extends CommandSession<Events> {
		async initialize(): Promise<void> {
			return await initialize(this);
		}

		async dispose(): Promise<void> {
			return await dispose(this);
		}
	})();
}
