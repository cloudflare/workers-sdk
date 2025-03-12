import assert from "node:assert";
import WebSocket from "ws";
import { isDevToolsEvent } from "./devtools";
import type {
	DevToolsCommandRequests,
	DevToolsEvent,
	DevToolsEvents,
} from "./devtools";

export class InspectorProxyRelay {
	#workerName: string;
	#runtimeWs: WebSocket;

	#devtoolsWs?: WebSocket;
	#devtoolsHaveFileSystemAccess = false;

	constructor(workerName: string, runtimeWs: WebSocket) {
		this.#workerName = workerName;
		this.#runtimeWs = runtimeWs;
		this.#runtimeWs.once("open", () => this.#handleRuntimeWebSocketOpen());
	}

	get workerName() {
		return this.#workerName;
	}

	get path() {
		return `/${this.#workerName}`;
	}

	onDevtoolsConnected(
		devtoolsWs: WebSocket,
		devtoolsHaveFileSystemAccess: boolean
	) {
		/** We only want to have one active Devtools instance at a time. */
		assert(
			!this.#devtoolsWs,
			"Too many clients; only one can be connected at a time"
		);
		this.#devtoolsWs = devtoolsWs;
		this.#devtoolsHaveFileSystemAccess = devtoolsHaveFileSystemAccess;

		assert(this.#devtoolsWs?.readyState === WebSocket.OPEN);

		this.#devtoolsWs.on("error", console.error);

		this.#devtoolsWs.once("close", () => {
			if (this.#runtimeWs?.OPEN) {
				// Since Miniflare proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
				// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
				// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
				// The key initialisation messages that are needed are the `Debugger.scriptParsed` events.
				this.#sendMessageToRuntime({
					method: "Debugger.disable",
					id: this.nextCounter(),
				});
			}
			this.#devtoolsWs = undefined;
		});

		this.#devtoolsWs.on("message", (data) => {
			const msg = JSON.parse(data.toString());
			assert(this.#runtimeWs?.OPEN);
			this.#sendMessageToRuntime(msg);
		});
	}

	#runtimeMessageCounter = 1e8;
	nextCounter() {
		return ++this.#runtimeMessageCounter;
	}

	#runtimeKeepAliveInterval: NodeJS.Timeout | undefined;

	#handleRuntimeWebSocketOpen() {
		assert(this.#runtimeWs?.OPEN);

		this.#runtimeWs.on("message", (data) => {
			const obj = JSON.parse(data.toString());

			if (!this.#devtoolsWs) {
				// there is no devtools connection established
				return;
			}

			if (isDevToolsEvent(obj, "Debugger.scriptParsed")) {
				return this.#handleRuntimeScriptParsed(obj);
			}

			return this.#sendMessageToDevtools(obj);
		});

		this.#sendMessageToRuntime({
			method: "Runtime.enable",
			id: this.nextCounter(),
		});
		this.#sendMessageToRuntime({
			method: "Network.enable",
			id: this.nextCounter(),
		});

		clearInterval(this.#runtimeKeepAliveInterval);
		this.#runtimeKeepAliveInterval = setInterval(() => {
			if (this.#runtimeWs?.OPEN) {
				this.#sendMessageToRuntime({
					method: "Runtime.getIsolateId",
					id: this.nextCounter(),
				});
			}
		}, 10_000);
	}

	#handleRuntimeScriptParsed(msg: DevToolsEvent<"Debugger.scriptParsed">) {
		// If the devtools does not have filesystem access,
		// rewrite the sourceMapURL to use a special scheme.
		// This special scheme is used to indicate whether
		// to intercept each loadNetworkResource message.

		if (
			!this.#devtoolsHaveFileSystemAccess &&
			msg.params.sourceMapURL !== undefined &&
			// Don't try to find a sourcemap for e.g. node-internal: scripts
			msg.params.url.startsWith("file:")
		) {
			const url = new URL(msg.params.sourceMapURL, msg.params.url);
			// Check for file: in case msg.params.sourceMapURL has a different
			// protocol (e.g. data). In that case we should ignore this file
			if (url.protocol === "file:") {
				msg.params.sourceMapURL = url.href.replace("file:", "wrangler-file:");
			}
		}

		return this.#sendMessageToDevtools(msg);
	}

	#sendMessageToDevtools(msg: DevToolsEvents) {
		assert(this.#devtoolsWs);

		if (!this.#devtoolsWs.OPEN) {
			// the devtools web socket is established but not yet connected
			this.#devtoolsWs.once("open", () =>
				this.#devtoolsWs?.send(JSON.stringify(msg))
			);
			return;
		}

		this.#devtoolsWs.send(JSON.stringify(msg));
	}

	#sendMessageToRuntime(msg: DevToolsCommandRequests) {
		assert(this.#runtimeWs?.OPEN);

		this.#runtimeWs.send(JSON.stringify(msg));
	}

	async dispose(): Promise<void> {
		clearInterval(this.#runtimeKeepAliveInterval);

		this.#devtoolsWs?.close();
	}
}
