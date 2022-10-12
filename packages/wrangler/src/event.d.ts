/*
 * Types for `Event` and `EventTarget` were added in @types/node for a version later
 * than the one we use in this project.
 *
 * Below are polyfills based on the documentation for `Event` and `EventTarget` as of Node 16.
 *
 * https://nodejs.org/docs/latest-v16.x/api/events.html
 *
 * See also:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/issues/52976
 */

declare module "node:events" {
	/**
	 * Event listeners registered for an event `type` may either be
	 * JavaScript functions or objects with a `handleEvent` property whose value is a function.
	 *
	 * In either case, the handler function is invoked with the `event`
	 * argument passed to the `eventTarget.dispatchEvent()` function.
	 *
	 * Async functions may be used as event listeners.
	 * If an async handler function rejects, the rejection is captured
	 * and handled as described in [1EventTarget1 error handling](https://nodejs.org/docs/latest-v16.x/api/events.html#eventtarget-error-handling).
	 *
	 * An error thrown by one handler function does not prevent the other handlers from being invoked.
	 *
	 * The return value of a handler function is ignored.
	 *
	 * Handlers are always invoked in the order they were added.
	 *
	 * Handler functions may mutate the event object.
	 */
	export type EventListener =
		| ((event: Event) => void | Promise<void>)
		| {
				handleEvent: (event: Event) => void | Promise<void>;
		  };

	/**
	 * The `Event` object is an adaptation of the [`Event` Web API](https://dom.spec.whatwg.org/#event).
	 *
	 * Instances are created internally by Node.js.
	 */
	export class Event {
		constructor(
			type: string,
			options?: { bubbles?: false; cancelable?: boolean; composed?: false }
		);

		/**
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public bubbles: false;

		/**
		 * Alias for event.stopPropagation(). This is not used in Node.js and is provided purely for completeness.
		 */
		public cancelBubble();

		/**
		 * True if the event was created with the `cancelable` option.
		 */
		public get cancelable(): boolean;

		/**
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public composed: false;

		/**
		 * Returns an array containing the current `EventTarget` as the only entry or
		 * empty if the event is not being dispatched.
		 *
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public composedPath(): [EventTarget] | [];

		/**
		 * Alias for event.target.
		 */
		public get currentTarget(): EventTarget;

		/**
		 * Is `true` if `cancelable` is `true` and `event.preventDefault()` has been called.
		 */
		public get defaultPrevented(): boolean;

		/**
		 * Returns `0` while an event is not being dispatched, `2` while it is being dispatched.
		 *
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public get eventPhase(): 0 | 2;

		/**
		 * The "abort" event is emitted with `isTrusted` set to true.
		 *
		 * The value is false in all other cases.
		 */
		public get isTrusted(): boolean;

		/**
		 * Sets the `defaultPrevented` property to true if `cancelable` is true.
		 */
		public preventDefault(): void;

		/**
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public get returnValue(): boolean;

		/**
		 * Alias for `event.target`.
		 */
		public get srcElement(): EventTarget;

		/**
		 * Stops the invocation of event listeners after the current one completes.
		 */
		public stopImmediatePropogation(): void;

		/**
		 * This is not used in Node.js and is provided purely for completeness.
		 */
		public stopPropogation(): void;

		/**
		 * The `EventTarget` dispatching the event.
		 */
		public get target(): EventTarget;

		/**
		 * The millisecond timestamp when the `Event` object was created.
		 */
		public get timeStamp(): number;

		/**
		 * The event type identifier.
		 */
		public get type(): string;
	}

	export class EventTarget {
		/**
		 * Adds a new handler for the `type` event.
		 * Any given `listener` is added only once per `type` and per `capture` option value.
		 *
		 * If the `once` option is true, the `listener` is removed after the next
		 * time a `type` event is dispatched.
		 *
		 * The `capture` option is not used by Node.js in any functional way other than
		 * tracking registered event listeners per the `EventTarget` specification.
		 * Specifically, the `capture` option is used as part of the key when registering a listener.
		 * Any individual listener may be added once with `capture = false`, and once with `capture = true`.
		 *
		 * ```typescript
		 * function handler(event) {}
		 *
		 * const target = new EventTarget();
		 * target.addEventListener('foo', handler, { capture: true });  // first
		 * target.addEventListener('foo', handler, { capture: false }); // second
		 *
		 * // Removes the second instance of handler
		 * target.removeEventListener('foo', handler);
		 *
		 * // Removes the first instance of handler
		 * target.removeEventListener('foo', handler, { capture: true });
		 * ```
		 */
		public addEventListener(
			type: string,
			listener: EventListener,
			options?: {
				/**
				 * When true, the listener is automatically removed when it is first invoked.
				 *
				 * Default: `false`.
				 */
				once?: boolean;

				/**
				 * When true, serves as a hint that the `listener` will not call the `Event` object's `preventDefault()` method.
				 *
				 * Default: `false`.
				 */
				passive?: boolean;

				/**
				 * Not directly used by Node.js. Added for API completeness.
				 *
				 * Default: `false`.
				 */
				capture?: boolean;
			}
		): void;

		/**
		 * Removes the `listener` from the list of handlers for event `type`.
		 */
		public removeEventListener(
			type: string,
			listener: EventListener,
			options?: { capture?: boolean }
		): void;

		/**
		 * Dispatches the event to the list of handlers for event.type.
		 *
		 * The registered event listeners is synchronously invoked in the order they were registered.
		 *
		 * @returns `true` if either `event`’s `cancelable` attribute value is `false`
		 * or its `preventDefault()` method was not invoked, otherwise `false`.
		 */
		public dispatchEvent(event: Event): boolean;
	}
}
