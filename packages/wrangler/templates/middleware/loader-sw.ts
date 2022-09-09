import { Awaitable, Dispatcher, Middleware, __facade_invoke__ } from "./common";
export { __facade_register__, __facade_registerInternal__ } from "./common";

// Miniflare's `EventTarget` follows the spec and doesn't allow exceptions to
// be caught by `dispatchEvent`. Instead it has a custom`ThrowingEventTarget`
// class that rethrows errors from event listeners in `dispatchEvent`.
// We'd like errors to be propagated to the top-level `addEventListener`, so
// we'd like to use `ThrowingEventTarget`. Unfortunately, `ThrowingEventTarget`
// isn't exposed on the global scope, but `WorkerGlobalScope` (which extends
// `ThrowingEventTarget`) is. Therefore, we get at it in this nasty way.
let __FACADE_EVENT_TARGET__: EventTarget;
if ((globalThis as any).MINIFLARE) {
	__FACADE_EVENT_TARGET__ = new (Object.getPrototypeOf(WorkerGlobalScope))();
} else {
	__FACADE_EVENT_TARGET__ = new EventTarget();
}

declare global {
	var __facade_addEventListener__: (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: EventTargetAddEventListenerOptions | boolean
	) => void;
	var __facade_removeEventListener__: (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: EventTargetEventListenerOptions | boolean
	) => void;
	var __facade_dispatchEvent__: (event: Event) => void;
}

function __facade_isSpecialEvent__(type: string) {
	return type === "fetch" || type === "scheduled";
}
globalThis.__facade_addEventListener__ = function (type, listener, options) {
	if (__facade_isSpecialEvent__(type)) {
		__FACADE_EVENT_TARGET__.addEventListener(type, listener, options);
	} else {
		globalThis.addEventListener(type as any, listener, options);
	}
};
globalThis.__facade_removeEventListener__ = function (type, listener, options) {
	if (__facade_isSpecialEvent__(type)) {
		__FACADE_EVENT_TARGET__.removeEventListener(type, listener, options);
	} else {
		globalThis.removeEventListener(type as any, listener, options);
	}
};
globalThis.__facade_dispatchEvent__ = function (event) {
	if (__facade_isSpecialEvent__(event.type)) {
		__FACADE_EVENT_TARGET__.dispatchEvent(event);
	} else {
		globalThis.dispatchEvent(event as any);
	}
};

const __facade_waitUntil__ = Symbol("__facade_waitUntil__");
const __facade_response__ = Symbol("__facade_response__");
const __facade_dispatched__ = Symbol("__facade_dispatched__");

class __Facade_ExtendableEvent__ extends Event {
	[__facade_waitUntil__]: Awaitable<unknown>[] = [];

	waitUntil(promise: Awaitable<any>) {
		if (!(this instanceof __Facade_ExtendableEvent__)) {
			throw new TypeError("Illegal invocation");
		}
		this[__facade_waitUntil__].push(promise);
	}
}

interface FetchEventInit extends EventInit {
	request: Request;
	passThroughOnException: FetchEvent["passThroughOnException"];
}

class __Facade_FetchEvent__ extends __Facade_ExtendableEvent__ {
	#request: Request;
	#passThroughOnException: FetchEvent["passThroughOnException"];
	[__facade_response__]?: Awaitable<Response>;
	[__facade_dispatched__] = false;

	constructor(type: "fetch", init: FetchEventInit) {
		super(type);
		this.#request = init.request;
		this.#passThroughOnException = init.passThroughOnException;
	}

	get request() {
		return this.#request;
	}

	respondWith(response: Awaitable<Response>) {
		if (!(this instanceof __Facade_FetchEvent__)) {
			throw new TypeError("Illegal invocation");
		}
		if (this[__facade_response__] !== undefined) {
			throw new DOMException(
				"FetchEvent.respondWith() has already been called; it can only be called once.",
				"InvalidStateError"
			);
		}
		if (this[__facade_dispatched__]) {
			throw new DOMException(
				"Too late to call FetchEvent.respondWith(). It must be called synchronously in the event handler.",
				"InvalidStateError"
			);
		}
		this.stopImmediatePropagation();
		this[__facade_response__] = response;
	}

	passThroughOnException() {
		if (!(this instanceof __Facade_FetchEvent__)) {
			throw new TypeError("Illegal invocation");
		}
		// Need to call native method immediately in case uncaught error thrown
		this.#passThroughOnException();
	}
}

interface ScheduledEventInit extends EventInit {
	scheduledTime: number;
	cron: string;
	noRetry: ScheduledEvent["noRetry"];
}

class __Facade_ScheduledEvent__ extends __Facade_ExtendableEvent__ {
	#scheduledTime: number;
	#cron: string;
	#noRetry: ScheduledEvent["noRetry"];

	constructor(type: "scheduled", init: ScheduledEventInit) {
		super(type);
		this.#scheduledTime = init.scheduledTime;
		this.#cron = init.cron;
		this.#noRetry = init.noRetry;
	}

	get scheduledTime() {
		return this.#scheduledTime;
	}

	get cron() {
		return this.#cron;
	}

	noRetry() {
		if (!(this instanceof __Facade_ScheduledEvent__)) {
			throw new TypeError("Illegal invocation");
		}
		// Need to call native method immediately in case uncaught error thrown
		this.#noRetry();
	}
}

globalThis.addEventListener("fetch", (event) => {
	const ctx: ExecutionContext = {
		waitUntil: event.waitUntil.bind(event),
		passThroughOnException: event.passThroughOnException.bind(event),
	};

	const __facade_sw_dispatch__: Dispatcher = function (type, init) {
		if (type === "scheduled") {
			const facadeEvent = new __Facade_ScheduledEvent__("scheduled", {
				scheduledTime: Date.now(),
				cron: init.cron ?? "",
				noRetry() {},
			});

			__FACADE_EVENT_TARGET__.dispatchEvent(facadeEvent);
			event.waitUntil(Promise.all(facadeEvent[__facade_waitUntil__]));
		}
	};

	const __facade_sw_fetch__: Middleware = function (request, _env, ctx) {
		const facadeEvent = new __Facade_FetchEvent__("fetch", {
			request,
			passThroughOnException: ctx.passThroughOnException,
		});

		__FACADE_EVENT_TARGET__.dispatchEvent(facadeEvent);
		facadeEvent[__facade_dispatched__] = true;
		event.waitUntil(Promise.all(facadeEvent[__facade_waitUntil__]));

		const response = facadeEvent[__facade_response__];
		if (response === undefined) {
			throw new Error("No response!"); // TODO: proper error message
		}
		return response;
	};

	event.respondWith(
		__facade_invoke__(
			event.request,
			globalThis,
			ctx,
			__facade_sw_dispatch__,
			__facade_sw_fetch__
		)
	);
});

globalThis.addEventListener("scheduled", (event) => {
	const facadeEvent = new __Facade_ScheduledEvent__("scheduled", {
		scheduledTime: event.scheduledTime,
		cron: event.cron,
		noRetry: event.noRetry.bind(event),
	});

	__FACADE_EVENT_TARGET__.dispatchEvent(facadeEvent);
	event.waitUntil(Promise.all(facadeEvent[__facade_waitUntil__]));
});
