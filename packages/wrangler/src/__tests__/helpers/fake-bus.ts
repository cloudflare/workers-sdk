import type {
	ControllerBus,
	ControllerEvent,
} from "../../api/startDevWorker/BaseController";

type EventType = ControllerEvent["type"];
type EventFor<T extends EventType> = Extract<ControllerEvent, { type: T }>;

/**
 * A fake ControllerBus for testing that records dispatched events
 * and provides a typed waitFor helper to wait for specific events.
 */
export class FakeBus implements ControllerBus {
	readonly events: ControllerEvent[] = [];
	private waiters: {
		match: (e: ControllerEvent) => boolean;
		resolve: (e: ControllerEvent) => void;
	}[] = [];

	dispatch(event: ControllerEvent): void {
		this.events.push(event);
		for (let i = 0; i < this.waiters.length; i++) {
			const w = this.waiters[i];
			if (w.match(event)) {
				this.waiters.splice(i, 1);
				return w.resolve(event);
			}
		}
	}

	/**
	 * Wait for a specific event type to be dispatched.
	 * @param type - The event type to wait for
	 * @param predicate - Optional predicate to filter events
	 * @param timeoutMs - Timeout in milliseconds (default: 15000)
	 * @returns Promise that resolves with the matching event
	 */
	waitFor<T extends EventType>(
		type: T,
		predicate?: (e: EventFor<T>) => boolean,
		timeoutMs = 15000
	): Promise<EventFor<T>> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`Timed out waiting for ${type}`)),
				timeoutMs
			);
			this.waiters.push({
				match: (e) =>
					e.type === type && (predicate?.(e as EventFor<T>) ?? true),
				resolve: (e) => {
					clearTimeout(timer);
					resolve(e as EventFor<T>);
				},
			});
		});
	}
}
