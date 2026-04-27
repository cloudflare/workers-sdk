/**
 * A minimal `WebSocket` stub that lets tests drive the auth relay flow without
 * making any network calls. Instances can be obtained via `MockWebSocket.last`
 * and driven with `triggerOpen`, `triggerMessage`, etc.
 *
 * Installed globally via the `undici` mock in `vitest.setup.ts`.
 */
export class MockWebSocket {
	static instances: MockWebSocket[] = [];

	static reset(): void {
		MockWebSocket.instances = [];
	}

	/** The most recently constructed mock WebSocket, or `undefined` if none. */
	static get last(): MockWebSocket | undefined {
		return MockWebSocket.instances[MockWebSocket.instances.length - 1];
	}

	url: string;
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

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
		// Auto-open in a microtask, simulating a successful connection. Tests
		// that want to exercise connection failure can call `triggerError()`
		// before any `await` lets the microtask fire.
		queueMicrotask(() => {
			if (this.readyState === 0) {
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
		this.readyState = 3; // CLOSED
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
