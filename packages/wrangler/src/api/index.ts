import { WebSocket } from "ws";
import { Config } from "../config";
import { TailCLIFilters, TailEventMessage } from "../tail";
import { ApiCredentials, loginOrRefreshIfRequired, requireAuth } from "../user";
import { unstable_tail } from "./tail";
import { Event, EventListener, EventTarget } from "node:events";

export { unstable_dev } from "./dev";
export type { UnstableDevWorker } from "./dev";

class Wrangler {
	private credentials: ApiCredentials;
	private accountId: string;
	private config?: Config;

	constructor(credentials: ApiCredentials, accountId: string, config?: Config) {
		this.credentials = credentials;
		this.accountId = accountId;
		this.config = config;
	}

	async tail(
		workerName: string,
		filters?: TailCLIFilters,
		environment?: string | { name: string; legacy: boolean }
	): Promise<Tail> {}
}

class Tail extends EventTarget {
	private ws: WebSocket;
	public expiration: Date;
	private deleteTail: () => Promise<void>; // mark tail for deletion in internal API

	constructor({
		tail,
		expiration,
		deleteTail,
	}: {
		tail: WebSocket;
		expiration: Date;
		deleteTail: () => Promise<void>;
	}) {
		super();
		this.ws = tail;
		this.expiration = expiration;
		this.deleteTail = deleteTail;

		this.addEventListener("close", async () => {
			this.ws.terminate();
			await this.deleteTail();
		});

		this.ws.on("message", (data) =>
			this.dispatchEvent(new MessageEvent(JSON.parse(data.toString())))
		);
	}

	public async close(): Promise<void> {
		this.dispatchEvent(new CloseEvent());
	}

	public dispatchEvent(event: CloseEvent): boolean;
	public dispatchEvent(event: Event): boolean {
		return super.dispatchEvent(event);
	}

	public addEventListener(
		type: "close",
		listener: EventListener,
		options?:
			| {
					once?: boolean | undefined;
					passive?: boolean | undefined;
					capture?: boolean | undefined;
			  }
			| undefined
	): void;
	public addEventListener(
		type: "message",
		listener: EventListener,
		options?:
			| {
					once?: boolean | undefined;
					passive?: boolean | undefined;
					capture?: boolean | undefined;
			  }
			| undefined
	): void;
	public addEventListener(
		type: string,
		listener: EventListener,
		options?:
			| {
					once?: boolean | undefined;
					passive?: boolean | undefined;
					capture?: boolean | undefined;
			  }
			| undefined
	): void {
		super.addEventListener(type, listener, options);
	}
}

class CloseEvent extends Event {
	constructor() {
		super("close");
	}
}

class MessageEvent extends Event {
	public message: TailEventMessage;

	constructor(message: TailEventMessage) {
		super("message");
		this.message = message;
	}
}
