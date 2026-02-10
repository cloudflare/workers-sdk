import assert from "node:assert";
import { once } from "node:events";
import NodeWebSocket from "ws";
import { TypedEventTarget } from "../shared";
import { ValueOf, viewToBuffer } from "../workers";

export class MessageEvent extends Event {
	readonly data: string | ArrayBuffer | Uint8Array<ArrayBuffer>;

	constructor(
		type: "message",
		init: { data: string | ArrayBuffer | Uint8Array<ArrayBuffer> }
	) {
		super(type);
		this.data = init.data;
	}
}

export class CloseEvent extends Event {
	readonly code: number;
	readonly reason: string;
	readonly wasClean: boolean;

	constructor(
		type: "close",
		init?: { code?: number; reason?: string; wasClean?: boolean }
	) {
		super(type);
		this.code = init?.code ?? 1005;
		this.reason = init?.reason ?? "";
		this.wasClean = init?.wasClean ?? false;
	}
}

export class ErrorEvent extends Event {
	readonly error: Error | null;

	constructor(type: "error", init?: { error?: Error }) {
		super(type);
		this.error = init?.error ?? null;
	}
}

// Maps web sockets to the other side of their connections, we don't want to
// expose this to the user, but this cannot be a private field as we need to
// construct both sockets before setting the circular references
const kPair = Symbol("kPair");

const kAccepted = Symbol("kAccepted");
const kCoupled = Symbol("kCoupled");

// Whether close() has been called on the socket
const kClosedOutgoing = Symbol("kClosedOutgoing");
// Whether a close event has been dispatched on the socket
const kClosedIncoming = Symbol("kClosedIncoming");

// Internal send method exposed to bypass accept checking
const kSend = Symbol("kSend");
// Internal close method exposed to bypass close code checking
const kClose = Symbol("kClose");
// Internal error method exposed to dispatch error events to pair
const kError = Symbol("kError");

export type WebSocketEventMap = {
	message: MessageEvent;
	close: CloseEvent;
	error: ErrorEvent;
};
export class WebSocket extends TypedEventTarget<WebSocketEventMap> {
	// The Workers runtime prefixes these constants with `READY_STATE_`, unlike
	// those in the spec: https://websockets.spec.whatwg.org/#interface-definition
	static readonly READY_STATE_CONNECTING = 0;
	static readonly READY_STATE_OPEN = 1;
	static readonly READY_STATE_CLOSING = 2;
	static readonly READY_STATE_CLOSED = 3;

	#dispatchQueue?: ValueOf<WebSocketEventMap>[] = [];
	[kPair]?: WebSocket;
	[kAccepted] = false;
	[kCoupled] = false;
	[kClosedOutgoing] = false;
	[kClosedIncoming] = false;

	get readyState(): number {
		if (this[kClosedOutgoing] && this[kClosedIncoming]) {
			return WebSocket.READY_STATE_CLOSED;
		} else if (this[kClosedOutgoing] || this[kClosedIncoming]) {
			return WebSocket.READY_STATE_CLOSING;
		}
		return WebSocket.READY_STATE_OPEN;
	}

	async #queuingDispatchToPair(event: ValueOf<WebSocketEventMap>) {
		const pair = this[kPair];
		assert(pair !== undefined);
		if (pair[kAccepted]) {
			pair.dispatchEvent(event);
		} else {
			// Queue event until pair has `accept()`ed
			assert(pair.#dispatchQueue !== undefined);
			pair.#dispatchQueue.push(event);
		}
	}

	accept(): void {
		if (this[kCoupled]) {
			throw new TypeError(
				"Can't accept() WebSocket that was already used in a response."
			);
		}

		if (this[kAccepted]) return; // Permit double `accept()`
		this[kAccepted] = true;

		if (this.#dispatchQueue !== undefined) {
			for (const event of this.#dispatchQueue) this.dispatchEvent(event);
			this.#dispatchQueue = undefined;
		}
	}

	send(message: string | ArrayBuffer | Uint8Array<ArrayBuffer>): void {
		if (!this[kAccepted]) {
			throw new TypeError(
				"You must call accept() on this WebSocket before sending messages."
			);
		}
		this[kSend](message);
	}

	[kSend](message: string | ArrayBuffer | Uint8Array<ArrayBuffer>): void {
		// Split from send() so we can queue messages before accept() is called when
		// forwarding message events from the client
		if (this[kClosedOutgoing]) {
			throw new TypeError("Can't call WebSocket send() after close().");
		}

		const event = new MessageEvent("message", { data: message });
		void this.#queuingDispatchToPair(event);
	}

	close(code?: number, reason?: string): void {
		if (code) {
			// https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
			const validCode =
				code >= 1000 &&
				code < 5000 &&
				code !== 1004 &&
				code !== 1005 &&
				code !== 1006 &&
				code !== 1015;
			if (!validCode) throw new TypeError("Invalid WebSocket close code.");
		}
		if (reason !== undefined && code === undefined) {
			throw new TypeError(
				"If you specify a WebSocket close reason, you must also specify a code."
			);
		}
		if (!this[kAccepted]) {
			throw new TypeError(
				"You must call accept() on this WebSocket before sending messages."
			);
		}
		this[kClose](code, reason);
	}

	[kClose](code?: number, reason?: string): void {
		// Split from close() so we can queue closes before accept() is called, and
		// skip close code checks when forwarding close events from the client.
		if (this[kClosedOutgoing]) throw new TypeError("WebSocket already closed");

		// Send close event to pair, it should then eventually call `close()` on
		// itself which will dispatch a close event to us, completing the closing
		// handshake:
		//               Network
		//  Browser/Server  |   ws                            WebSocketPair
		//     -------      | -------                         -------------
		//     |     |  ... | |     | <--- 2) CloseEvent <--- | inc < out | <--- 1) close()
		//     |     |      | |     |                         |     |     |
		//     |     |  ... | |     | --->    3) close() ---> | out > inc | ---> 4) CloseEvent
		//     -------      | -------                         -------------
		//                  |
		//                  |
		//     -------      | -------                         -------------
		//     |     |  ... | |     | --->    1) close() ---> | out > inc | ---> 2) CloseEvent
		//     |     |      | |     |                         |     |     |
		//     |     |  ... | |     | <--- 4) CloseEvent <--- | inc < out | <--- 3) close()
		//     -------      | -------                         -------------
		//                  |

		const pair = this[kPair];
		assert(pair !== undefined);

		this[kClosedOutgoing] = true;
		pair[kClosedIncoming] = true;

		const event = new CloseEvent("close", { code, reason });
		void this.#queuingDispatchToPair(event);
	}

	[kError](error?: Error): void {
		const event = new ErrorEvent("error", { error });
		void this.#queuingDispatchToPair(event);
	}
}

// Ensure correct typing with `Object.values()`. If we just used a simple class,
// trying to call `Object.values(new WebSocketPair())` would result in the
// following `any` typed values:
//
// ```ts
// const [one, two] = Object.values(new WebSocketPair());
//       // ^? const one: any
// ```
//
// With this definition, `one` and `two` will be typed `WebSocket`.
export type WebSocketPair = {
	0: WebSocket;
	1: WebSocket;
};
export const WebSocketPair = function (this: WebSocketPair) {
	if (!(this instanceof WebSocketPair)) {
		throw new TypeError(
			"Failed to construct 'WebSocketPair': Please use the 'new' operator, this object constructor cannot be called as a function."
		);
	}
	this[0] = new WebSocket();
	this[1] = new WebSocket();
	this[0][kPair] = this[1];
	this[1][kPair] = this[0];
} as unknown as { new (): WebSocketPair };

export async function coupleWebSocket(
	ws: NodeWebSocket,
	pair: WebSocket
): Promise<void> {
	if (pair[kCoupled]) {
		throw new TypeError(
			"Can't return WebSocket that was already used in a response."
		);
	}
	if (pair[kAccepted]) {
		throw new TypeError(
			"Can't return WebSocket in a Response after calling accept()."
		);
	}

	// Forward events from client to worker (register this before `open` to ensure
	// events queued before other pair `accept`s to release)
	ws.on("message", (message: Buffer, isBinary: boolean) => {
		// Silently discard messages received after close:
		// https://www.rfc-editor.org/rfc/rfc6455#section-1.4
		if (!pair[kClosedOutgoing]) {
			// Note `[kSend]` skips accept check and will queue messages if other pair
			// hasn't `accept`ed yet. Also convert binary messages to `ArrayBuffer`s.
			pair[kSend](isBinary ? viewToBuffer(message) : message.toString());
		}
	});
	ws.on("close", (code: number, reason: Buffer) => {
		// Silently discard closes received after close
		if (!pair[kClosedOutgoing]) {
			// Note `[kClose]` skips accept check and will queue messages if other
			// pair hasn't `accept`ed yet. It also skips code/reason validation,
			// allowing reserved codes (e.g. 1005 for "No Status Received").
			pair[kClose](code, reason.toString());
		}
	});
	ws.on("error", (error) => {
		pair[kError](error);
	});

	// Forward events from worker to client
	pair.addEventListener("message", (e) => {
		ws.send(e.data);
	});
	pair.addEventListener("close", (e) => {
		if (e.code === 1005 /* No Status Received */) {
			ws.close();
		} else if (e.code === 1006 /* Abnormal Closure */) {
			ws.terminate();
		} else {
			ws.close(e.code, e.reason);
		}
	});

	if (ws.readyState === NodeWebSocket.CONNECTING) {
		// Wait for client to be open before accepting worker pair (which would
		// release buffered messages). Note this will throw if an "error" event is
		// dispatched (https://github.com/cloudflare/miniflare/issues/229).
		await once(ws, "open");
	} else if (ws.readyState >= NodeWebSocket.CLOSING) {
		throw new TypeError("Incoming WebSocket connection already closed.");
	}
	pair.accept();
	pair[kCoupled] = true;
}
