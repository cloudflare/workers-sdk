import { WebSocket } from "mock-socket";

/**
 * A version of the mock WebSocket that supports the methods that we use.
 */
export class MockWebSocket extends WebSocket {
	private pongListener: undefined | ((...args: unknown[]) => void);
	on(event: string | symbol, listener: (...args: unknown[]) => void): this {
		switch (event) {
			case "message":
				this.onmessage = ({ data }) => {
					listener(data);
				};
				break;
			case "open":
				this.onopen = listener;
				break;
			case "close":
				this.onclose = listener;
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
