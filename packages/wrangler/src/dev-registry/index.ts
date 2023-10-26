import childProcess from "child_process";
import events from "node:events";
import path from "node:path";
import timers from "node:timers/promises";
import util from "node:util";
import chalk from "chalk";
import { fetch } from "undici";
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
function isAbortError(value: unknown): boolean {
	// Matches `DOMException [AbortError]` and Node's `AbortError`
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		value.name === "AbortError"
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
	daemonProcess.on("exit", (code) => {
		console.log(chalk.cyan(`[DEV REGISTRY] Daemon exited with code ${code}`));
	});
	const [message] = (await events.once(daemonProcess, "message")) as [
		WorkerRegistryDaemonMessage
	];
	console.log(
		chalk.cyan(`[DEV REGISTRY] Daemon message ${JSON.stringify(message)}`)
	);
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
	#disposeController = new AbortController();

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
		void this.#subscribe();
	}

	async query(options?: Abortable): Promise<WorkerRegistry> {
		await this.#initPromise;
		const res = await fetch(`${DEV_REGISTRY_HOST}/workers/`, options);
		return (await res.json()) as WorkerRegistry;
	}

	async #subscribe() {
		let failed = false;
		const signal = this.#disposeController.signal;
		const signalOptions = { signal };
		while (!signal.aborted) {
			try {
				const registry = await this.query(signalOptions);
				// Ignore our own registration to avoid unnecessary reloads
				if (this.name !== undefined) delete registry[this.name];
				if (!util.isDeepStrictEqual(registry, this.#lastRegistry)) {
					this.#lastRegistry = registry;
					this.callback(registry);
				}
			} catch (error) {
				// Ignore abort errors
				if (isAbortError(error)) break;

				// Only log first error
				if (failed) continue;
				failed = true;
				logRegistryError("query", error);
			}
			try {
				await timers.setTimeout(300, undefined, signalOptions);
			} catch (error) {
				if (!isAbortError(error)) throw error; // Something's gone very wrong
			}
		}
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
			await fetch(`${DEV_REGISTRY_HOST}/workers/${this.name}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(definition),
			});
		} catch (error) {
			return logRegistryError("update", error);
		}
	}

	dispose() {
		this.#disposeController.abort();
	}
}

export type {
	WorkerRegistry,
	UpdatableWorkerRegistry,
	WorkerDefinition,
} from "./constants";
