import childProcess from "child_process";
import assert from "node:assert";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { fetch } from "undici";
import { WebSocket } from "ws";
import { logger } from "../logger";
import { getBasePath } from "../paths";
import {
	DEV_REGISTRY_DAEMON_EXIT_TIMEOUT,
	DEV_REGISTRY_HOST,
} from "./constants";
import type { Config } from "../config";
import type {
	WorkerDefinition,
	WorkerRegistry,
	WorkerRegistryDaemonMessage,
} from "./constants";
import type { Abortable } from "node:events";

function isCodeError(value: unknown): value is { code: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		typeof value.code === "string"
	);
}

async function ensureRegistryDaemon() {
	const daemonPath = path.join(
		getBasePath(),
		"wrangler-dist",
		"dev-registry",
		"daemon.js"
	);
	const daemonProcess = childProcess.spawn(process.execPath, [daemonPath], {
		detached: true,
		windowsHide: true,
		stdio: ["ignore", "ignore", "ignore", "ipc"],
	});
	const [message] = (await events.once(daemonProcess, "message")) as [
		WorkerRegistryDaemonMessage
	];
	if (message.type === "error") {
		if (isCodeError(message.error) && message.error.code === "EADDRINUSE") {
			return;
		} else {
			throw message.error;
		}
	}

	daemonProcess.unref();
}

function logRegistryError(action: string, error: unknown) {
	logger.error(
		`Failed to ${action} service registry.\nPlease quit all \`wrangler\` processes, wait ${
			DEV_REGISTRY_DAEMON_EXIT_TIMEOUT / 1000
		}s, and try again.`,
		error
	);
}

export function getBoundWorkers(
	registry: WorkerRegistry,
	services: Config["services"] | undefined,
	durableObjects: Config["durable_objects"] | undefined
): WorkerRegistry {
	const serviceNames = services?.map(({ service }) => service) ?? [];
	const objectServiceNames =
		durableObjects?.bindings?.map(({ script_name }) => script_name) ?? [];
	return Object.fromEntries(
		Object.entries(registry ?? {}).filter(
			([serviceName]) =>
				serviceNames.includes(serviceName) ||
				objectServiceNames.includes(serviceName)
		)
	);
}

export class RegistryHandle {
	readonly #initPromise: Promise<void>;
	#lastDefinition?: WorkerDefinition;
	#lastRegistry?: WorkerRegistry;
	#disposed = false;
	#webSocket?: WebSocket;

	constructor(
		private readonly name: string | undefined,
		private readonly callback: (registry: WorkerRegistry) => void
	) {
		this.#initPromise = this.#init().catch((error) => {
			logRegistryError("setup", error);
		});
	}

	async #init() {
		await ensureRegistryDaemon();
		if (this.#disposed) return;

		const ws = new WebSocket(`ws://${DEV_REGISTRY_HOST}/workers/${this.name}`);
		this.#webSocket = ws;
		return new Promise<void>((resolve) => {
			ws.on("message", (data) => {
				const registry = JSON.parse(data.toString());
				// Ignore our own registration to avoid unnecessary reloads
				if (this.name !== undefined) delete registry[this.name];
				if (!util.isDeepStrictEqual(registry, this.#lastRegistry)) {
					this.#lastRegistry = registry;
					this.callback(registry);
				}
			});
			// Intentionally not `reject()`ing the promise for `close`/`error` events.
			// We just want to resolve `this.#initPromise` in these cases. Code should
			// verify the socket's `readyState` before attempting to use it.
			ws.once("open", () => resolve());
			ws.once("close", () => resolve());
			ws.once("error", (error) => {
				logRegistryError("query", error);
				resolve();
			});
		});
	}

	async query(options?: Abortable): Promise<WorkerRegistry> {
		await this.#initPromise;
		const res = await fetch(`http://${DEV_REGISTRY_HOST}/workers/`, options);
		assert.strictEqual(res.status, 200);
		return (await res.json()) as WorkerRegistry;
	}

	async update(definition: WorkerDefinition): Promise<void> {
		// If the worker definition hasn't changed, we don't need to update our
		// registration in the registry
		if (
			this.name === undefined ||
			util.isDeepStrictEqual(definition, this.#lastDefinition)
		) {
			return;
		}

		try {
			await this.#initPromise;
			assert(this.#webSocket !== undefined);
			if (this.#webSocket.readyState !== WebSocket.OPEN) return;
			this.#webSocket.send(JSON.stringify(definition));
		} catch (error) {
			logRegistryError("update", error);
		}
	}

	dispose() {
		// We've either created the WebSocket or are about to. Setting `#disposed`
		// to `true` ensures we don't create the WebSocket, and attempting to
		// `close()` the socket ensures if we did create one, it's closed.
		this.#disposed = true;
		this.#webSocket?.close(1000);
	}
}

export type {
	WorkerRegistry,
	UpdatableWorkerRegistry,
	WorkerDefinition,
} from "./constants";
