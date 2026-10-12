import {
	__facade_invoke__,
	__facade_register__,
	__facade_registerInternal__,
	Awaitable,
	Dispatcher,
	IncomingRequest,
	Middleware,
} from "./common";

export { __facade_register__, __facade_registerInternal__ };

const __FACADE_EVENT_TARGET__ = new EventTarget();
const __facade_eventListenerErrors__ = new WeakMap<Event, unknown>();
const __facade_eventListenerWrappers__ = new WeakMap<
	EventListenerOrEventListenerObject,
	EventListener
>();

// Facade events model runtime event delivery, so listener exceptions must
// propagate even when EventTarget uses spec-compliant report-and-continue semantics.
function __facade_getEventListenerWrapper__(
	listener: EventListenerOrEventListenerObject
): EventListener {
	const existingWrapper = __facade_eventListenerWrappers__.get(listener);
	if (existingWrapper !== undefined) {
		return existingWrapper;
	}

	const wrapper: EventListener = function (this: EventTarget, event) {
		try {
			if (typeof listener === "function") {
				listener.call(this, event);
			} else {
				listener.handleEvent(event);
			}
		} catch (error) {
			__facade_eventListenerErrors__.set(event, error);
			event.stopImmediatePropagation();
		}
	};
	__facade_eventListenerWrappers__.set(listener, wrapper);
	return wrapper;
}

function __facade_dispatchEvent__(event: Event): boolean {
	const result = __FACADE_EVENT_TARGET__.dispatchEvent(event);
	if (!__facade_eventListenerErrors__.has(event)) {
		return result;
	}

	const error = __facade_eventListenerErrors__.get(event);
	__facade_eventListenerErrors__.delete(event);
	throw error;
}

function __facade_isSpecialEvent__(
	type: string
): type is "fetch" | "scheduled" {
	return type === "fetch" || type === "scheduled";
}
const __facade__originalAddEventListener__ = globalThis.addEventListener;
const __facade__originalRemoveEventListener__ = globalThis.removeEventListener;
const __facade__originalDispatchEvent__ = globalThis.dispatchEvent;

globalThis.addEventListener = function (type, listener, options) {
	if (__facade_isSpecialEvent__(type)) {
		__FACADE_EVENT_TARGET__.addEventListener(
			type,
			__facade_getEventListenerWrapper__(
				listener as EventListenerOrEventListenerObject
			),
			options
		);
	} else {
		__facade__originalAddEventListener__(type, listener, options);
	}
};
globalThis.removeEventListener = function (type, listener, options) {
	if (__facade_isSpecialEvent__(type)) {
		__FACADE_EVENT_TARGET__.removeEventListener(
			type,
			__facade_getEventListenerWrapper__(
				listener as EventListenerOrEventListenerObject
			),
			options
		);
	} else {
		__facade__originalRemoveEventListener__(type, listener, options);
	}
};
globalThis.dispatchEvent = function (event) {
	if (__facade_isSpecialEvent__(event.type)) {
		return __facade_dispatchEvent__(event);
	} else {
		return __facade__originalDispatchEvent__(event);
	}
};

declare global {
	var addMiddleware: typeof __facade_register__;
	var addMiddlewareInternal: typeof __facade_registerInternal__;
}
globalThis.addMiddleware = __facade_register__;
globalThis.addMiddlewareInternal = __facade_registerInternal__;

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

__facade__originalAddEventListener__("fetch", (event) => {
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

			__facade_dispatchEvent__(facadeEvent);
			event.waitUntil(Promise.all(facadeEvent[__facade_waitUntil__]));
		}
	};

	const __facade_sw_fetch__: Middleware = function (request, _env, ctx) {
		const facadeEvent = new __Facade_FetchEvent__("fetch", {
			request,
			passThroughOnException: ctx.passThroughOnException,
		});

		__facade_dispatchEvent__(facadeEvent);
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
			event.request as IncomingRequest,
			globalThis,
			ctx,
			__facade_sw_dispatch__,
			__facade_sw_fetch__
		)
	);
});

__facade__originalAddEventListener__("scheduled", (event) => {
	const facadeEvent = new __Facade_ScheduledEvent__("scheduled", {
		scheduledTime: event.scheduledTime,
		cron: event.cron,
		noRetry: event.noRetry.bind(event),
	});

	__facade_dispatchEvent__(facadeEvent);
	event.waitUntil(Promise.all(facadeEvent[__facade_waitUntil__]));
});
