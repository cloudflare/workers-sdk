import { WebSocket } from "mock-socket";

/**
 * A version of the mock WebSocket that supports the methods that we use.
 *
 * The real `ws` package's `WebSocket` extends `EventEmitter` and supports
 * multiple listeners per event. mock-socket's `WebSocket` only models the
 * browser-style `on<event>` property setters (one-listener-per-event), so
 * we delegate to its underlying `EventTarget.addEventListener` to give the
 * production code multi-listener semantics that match real `ws`.
 */
export class MockWebSocket extends WebSocket {
	private pongListener: undefined | ((...args: unknown[]) => void);

	on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		switch (event) {
			case "message":
				this.addEventListener("message", (e: unknown) => {
					listener((e as MessageEvent).data);
				});
				break;
			case "open":
				this.addEventListener("open", listener);
				break;
			case "close":
				// Match the real `ws` package's `close` event signature
				// (`(code, reason) => void`) instead of forwarding the raw
				// `CloseEvent`. This lets our production code branch on the
				// close code in tests just like it does at runtime.
				this.addEventListener("close", (e: unknown) => {
					const closeEvent = e as
						| { code?: number; reason?: string }
						| undefined;
					listener(closeEvent?.code, closeEvent?.reason);
				});
				break;
			case "pong":
				this.pongListener = listener;
				break;
			default:
				throw new Error("Unknown event type: " + event.toString());
		}
		return this;
	}

	ping(data: Buffer) {
		this.pongListener?.(data);
	}

	terminate() {
		this.close();
	}
}
