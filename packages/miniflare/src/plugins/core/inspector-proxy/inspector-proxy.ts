import assert from "node:assert";
import WebSocket from "ws";
import { Log } from "../../../shared";
import { isDevToolsEvent } from "./devtools";
import type {
	DevToolsCommandRequests,
	DevToolsEvent,
	DevToolsEvents,
} from "./devtools";

/**
 * An `InspectorProxy` connects to a single runtime (/workerd) inspector server and proxies websocket communication
 * between the inspector server and potential inspector clients (/devtools).
 *
 * Each `InspectorProxy` has one and only one worker inspector server associated to it.
 */
export class InspectorProxy {
	#log: Log;
	#workerName: string;
	#runtimeWs: WebSocket;

	#devtoolsWs?: WebSocket;
	#devtoolsHaveFileSystemAccess = false;

	constructor(log: Log, workerName: string, runtimeWs: WebSocket) {
		this.#log = log;
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
		if (this.#devtoolsWs) {
			/** We only want to have one active Devtools instance at a time. */
			// TODO(consider): prioritise new websocket over previous
			devtoolsWs.close(
				1013,
				"Too many clients; only one can be connected at a time"
			);
			return;
		}
		this.#devtoolsWs = devtoolsWs;
		this.#devtoolsHaveFileSystemAccess = devtoolsHaveFileSystemAccess;

		assert(this.#devtoolsWs?.readyState === WebSocket.OPEN);

		this.#devtoolsWs.on("error", (message) => this.#log.error(message));

		this.#devtoolsWs.once("close", () => {
			if (this.#runtimeWs?.OPEN) {
				// Since Miniflare proxies the inspector, reloading Chrome DevTools won't trigger debugger initialisation events (because it's connecting to an extant session).
				// This sends a `Debugger.disable` message to the remote when a new WebSocket connection is initialised,
				// with the assumption that the new connection will shortly send a `Debugger.enable` event and trigger re-initialisation.
				// The key initialisation messages that are needed are the `Debugger.scriptParsed` events.
				this.#sendMessageToRuntime({
					method: "Debugger.disable",
					id: this.#nextCounter(),
				});
			}
			this.#devtoolsWs = undefined;
		});

		this.#devtoolsWs.on("message", (data) => {
			const message = JSON.parse(data.toString());
			assert(this.#runtimeWs?.OPEN);
			this.#sendMessageToRuntime(message);
		});
	}

	#runtimeMessageCounter = 1e8;
	#nextCounter() {
		return ++this.#runtimeMessageCounter;
	}

	#runtimeKeepAliveInterval: NodeJS.Timeout | undefined;

	#handleRuntimeWebSocketOpen() {
		assert(this.#runtimeWs?.OPEN);

		this.#runtimeWs.on("message", (data) => {
			const message = JSON.parse(data.toString());

			if (!this.#devtoolsWs) {
				// there is no devtools connection established
				return;
			}

			if (isDevToolsEvent(message, "Debugger.scriptParsed")) {
				return this.#handleRuntimeScriptParsed(message);
			}

			return this.#sendMessageToDevtools(message);
		});

		clearInterval(this.#runtimeKeepAliveInterval);
		this.#runtimeKeepAliveInterval = setInterval(() => {
			if (this.#runtimeWs?.OPEN) {
				this.#sendMessageToRuntime({
					method: "Runtime.getIsolateId",
					id: this.#nextCounter(),
				});
			}
		}, 10_000);
	}

	#handleRuntimeScriptParsed(message: DevToolsEvent<"Debugger.scriptParsed">) {
		// If the devtools does not have filesystem access,
		// rewrite the sourceMapURL to use a special scheme.
		// This special scheme is used to indicate whether
		// to intercept each loadNetworkResource message.

		if (
			!this.#devtoolsHaveFileSystemAccess &&
			message.params.sourceMapURL !== undefined &&
			// Don't try to find a sourcemap for e.g. node-internal: scripts
			message.params.url.startsWith("file:")
		) {
			const url = new URL(message.params.sourceMapURL, message.params.url);
			// Check for file: in case message.params.sourceMapURL has a different
			// protocol (e.g. data). In that case we should ignore this file
			if (url.protocol === "file:") {
				message.params.sourceMapURL = url.href.replace(
					"file:",
					"wrangler-file:"
				);
			}
		}

		return this.#sendMessageToDevtools(message);
	}

	#sendMessageToDevtools(message: DevToolsEvents) {
		assert(this.#devtoolsWs);

		if (!this.#devtoolsWs.OPEN) {
			// the devtools web socket is established but not yet connected
			this.#devtoolsWs.once("open", () =>
				this.#devtoolsWs?.send(JSON.stringify(message))
			);
			return;
		}

		this.#devtoolsWs.send(JSON.stringify(message));
	}

	#sendMessageToRuntime(message: DevToolsCommandRequests) {
		assert(this.#runtimeWs?.OPEN);

		this.#runtimeWs.send(JSON.stringify(message));
	}

	async dispose(): Promise<void> {
		clearInterval(this.#runtimeKeepAliveInterval);

		this.#devtoolsWs?.close();
	}
}
