/**
 * Constructor options recorded on each MockWebSocket instance. Mirrors the
 * shape of the real `ws` package's `ClientOptions` for the fields Wrangler
 * uses (`headers`, `maxPayload`).
 */
export interface MockWebSocketOptions {
	headers?: Record<string, string>;
	maxPayload?: number;
}

/**
 * A minimal `WebSocket` stub that lets tests drive the auth relay flow without
 * making any network calls. Instances can be obtained via `MockWebSocket.last`
 * and driven with `triggerOpen`, `triggerMessage`, etc.
 *
 * Installed globally via the `ws` mock in `vitest.setup.ts`.
 */
export class MockWebSocket {
	static instances: MockWebSocket[] = [];

	/**
	 * When `true` (default), constructed WebSockets fire `open` on the next
	 * microtask. Tests that want to simulate a hung or failed connection
	 * should set this to `false` before triggering the flow under test.
	 * `MockWebSocket.reset()` resets this back to `true`.
	 */
	static autoOpen = true;

	static reset(): void {
		MockWebSocket.instances = [];
		MockWebSocket.autoOpen = true;
	}

	/** The most recently constructed mock WebSocket, or `undefined` if none. */
	static get last(): MockWebSocket | undefined {
		return MockWebSocket.instances[MockWebSocket.instances.length - 1];
	}

	url: string;
	options: MockWebSocketOptions | undefined;
	readyState = 0; // CONNECTING

	private listeners: {
		open: Set<(event: unknown) => void>;
		message: Set<(event: { data: string }) => void>;
		close: Set<(event: unknown) => void>;
		error: Set<(event: { message?: string }) => void>;
	} = {
		open: new Set(),
		message: new Set(),
		close: new Set(),
		error: new Set(),
	};

	constructor(url: string | URL, options?: MockWebSocketOptions) {
		this.url = typeof url === "string" ? url : url.toString();
		this.options = options;
		MockWebSocket.instances.push(this);
		// Auto-open in a microtask, simulating a successful connection. Tests
		// that want to exercise connection failure can set
		// `MockWebSocket.autoOpen = false` before constructing the socket
		// (or before any `await` lets the microtask fire).
		queueMicrotask(() => {
			if (MockWebSocket.autoOpen && this.readyState === 0) {
				this.triggerOpen();
			}
		});
	}

	addEventListener(
		type: "open" | "message" | "close" | "error",
		listener: (event: never) => void
	): void {
		this.listeners[type].add(listener as (event: unknown) => void);
	}

	removeEventListener(
		type: "open" | "message" | "close" | "error",
		listener: (event: never) => void
	): void {
		this.listeners[type].delete(listener as (event: unknown) => void);
	}

	send(_data: string): void {
		// no-op
	}

	close(_code?: number, _reason?: string): void {
		// Match real WebSocket semantics: closing dispatches a `close` event
		// (asynchronously) to any registered listeners. We fire it on the next
		// microtask to mimic the queue-and-deliver behaviour of ws/browser
		// WebSockets, which is what makes the orphan-rejection bug observable.
		if (this.readyState === 3) {
			return;
		}
		this.readyState = 3; // CLOSED
		const listeners = Array.from(this.listeners.close);
		queueMicrotask(() => {
			for (const listener of listeners) {
				listener({});
			}
		});
	}

	terminate(): void {
		// Same effect as close() for our purposes: dispatch close listeners
		// asynchronously and transition to CLOSED. The real `ws.terminate()`
		// is force-destroy without a CLOSE frame, but tests don't observe
		// the wire — they only care about state and listener delivery.
		this.close();
	}

	// --- Test driver helpers ---

	triggerOpen(): void {
		this.readyState = 1; // OPEN
		for (const listener of this.listeners.open) {
			listener({});
		}
	}

	triggerMessage(data: string): void {
		for (const listener of this.listeners.message) {
			listener({ data });
		}
	}

	triggerClose(): void {
		this.readyState = 3;
		for (const listener of this.listeners.close) {
			listener({});
		}
	}

	triggerError(message?: string): void {
		for (const listener of this.listeners.error) {
			listener({ message });
		}
	}
}
