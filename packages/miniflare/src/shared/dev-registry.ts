import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { FSWatcher, watch } from "chokidar";
import { INBOUND_DO_PROXY_SERVICE_PATH } from "./external-service";
import { Log } from "./log";

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerEntrypointsDefinition = Record<
	"default" | string,
	{ host: string; port: number } | undefined
>;

export type WorkerDefinition = {
	protocol: "http" | "https";
	host: string;
	port: number;
	entrypointAddresses: WorkerEntrypointsDefinition;
	durableObjects: { name: string; className: string }[];
};

export class DevRegistry {
	private heartbeats = new Map<string, NodeJS.Timeout>();
	private registry: WorkerRegistry = {};
	private registeredWorkers: Set<string> = new Set();
	private subscribers: Map<string, Array<() => void>> = new Map();
	private watcher: FSWatcher | undefined;

	constructor(
		private registryPath: string | undefined,
		private enableDurableObjectProxy: boolean,
		private log: Log
	) {}

	/**
	 * Watch files inside the registry directory for changes.
	 */
	public watch(): void {
		if (!this.registryPath || this.watcher) {
			return;
		}

		this.watcher = watch(this.registryPath).on("all", () => this.refresh());
		this.refresh();
	}

	/**
	 * Unregister all managed workers and close the watcher.
	 * This is a sync function that returns a promise
	 * to ensure all workers are unregistered within the exit hook
	 */
	public dispose(): Promise<void> | undefined {
		for (const worker of this.registeredWorkers) {
			this.unregister(worker);
		}
		this.registeredWorkers.clear();
		this.subscribers.clear();
		this.registry = {};

		// Only this step is async and could be awaited
		return this.watcher?.close();
	}

	/**
	 * Unregister worker in the registry.
	 */
	private unregister(name: string): void {
		try {
			const existingHeartbeat = this.heartbeats.get(name);

			// Clear the check first before removing the files on disk
			if (existingHeartbeat) {
				this.heartbeats.delete(name);
				clearInterval(existingHeartbeat);
			}

			if (this.registryPath) {
				unlinkSync(path.join(this.registryPath, name));
			}

			this.notifySubscribers(name);
		} catch (e) {
			this.log?.debug(`Failed to unregister worker "${name}": ${e}`);
		}
	}

	public isEnabled(): boolean {
		return this.registryPath !== undefined;
	}

	public isDurableObjectProxyEnabled(): boolean {
		return this.isEnabled() && this.enableDurableObjectProxy;
	}

	public async updateRegistryPath(
		registryPath: string | undefined,
		enableDurableObjectProxy: boolean
	): Promise<void> {
		await this.dispose();
		this.registryPath = registryPath;
		this.enableDurableObjectProxy = enableDurableObjectProxy;
		await this.watch();
	}

	public register(workers: Record<string, WorkerDefinition>) {
		if (!this.registryPath) {
			return;
		}

		for (const [name, definition] of Object.entries(workers)) {
			const definitionPath = path.join(this.registryPath, name);
			const existingHeartbeat = this.heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}
			mkdirSync(this.registryPath, { recursive: true });

			// Skip the durable objects in the definition if the proxy is not enabled
			if (!this.enableDurableObjectProxy) {
				definition.durableObjects = [];
			}

			writeFileSync(definitionPath, JSON.stringify(definition, null, 2));
			this.registeredWorkers.add(name);
			this.heartbeats.set(
				name,
				setInterval(() => {
					if (existsSync(definitionPath)) {
						utimesSync(definitionPath, new Date(), new Date());
					}
				}, 30_000)
			);
		}
	}

	public getExternalServiceAddress(
		service: string,
		entrypoint: string
	): {
		protocol: "http" | "https";
		host: string;
		port: number;
	} | null {
		if (!this.isEnabled()) {
			return null;
		}

		const target = this.registry?.[service];
		const entrypointAddress = target?.entrypointAddresses[entrypoint];

		if (entrypointAddress !== undefined) {
			return {
				protocol: target.protocol,
				host: entrypointAddress.host,
				port: entrypointAddress.port,
			};
		}

		if (target && target.protocol !== "https" && entrypoint === "default") {
			// Fallback to sending requests directly to the entry worker
			return {
				protocol: target.protocol,
				host: target.host,
				port: target.port,
			};
		}

		return null;
	}

	public getExternalDurableObjectAddress(
		scriptName: string,
		className: string
	): {
		protocol: "http" | "https";
		host: string;
		port: number;
		path: string;
	} | null {
		if (!this.isDurableObjectProxyEnabled()) {
			return null;
		}

		const target = this.registry?.[scriptName];

		if (
			target?.durableObjects.some(
				(durableObject) => durableObject.className === className
			)
		) {
			return {
				...target,
				path: `/${INBOUND_DO_PROXY_SERVICE_PATH}`,
			};
		}

		return null;
	}

	public subscribe(workerName: string, callback: () => void): void {
		let callbacks = this.subscribers.get(workerName);

		if (!callbacks) {
			callbacks = [];
			this.subscribers.set(workerName, callbacks);
		}

		callbacks.push(callback);
	}

	private notifySubscribers(workerName: string): void {
		const callbacks = this.subscribers.get(workerName);
		if (callbacks) {
			for (const callback of callbacks) {
				callback();
			}
		}
	}

	private refresh(): void {
		if (!this.registryPath) {
			return;
		}

		// Make sure the registry path exists
		mkdirSync(this.registryPath, { recursive: true });

		const workerNames = readdirSync(this.registryPath);

		// Cleanup existing definition that are not in the registry anymore
		for (const existingWorkerName of Object.keys(this.registry)) {
			if (!workerNames.includes(existingWorkerName)) {
				delete this.registry[existingWorkerName];
				this.notifySubscribers(existingWorkerName);
			}
		}

		for (const workerName of workerNames) {
			try {
				const definitionPath = path.join(this.registryPath, workerName);
				const file = readFileSync(definitionPath, "utf8");
				const stats = statSync(definitionPath);

				// Cleanup existing workers older than 5 minutes
				if (stats.mtime.getTime() < Date.now() - 300_000) {
					this.unregister(workerName);
					continue;
				}

				if (
					// If the worker is not registered before, or
					!this.registry[workerName] ||
					// If the file content is different from the registry
					file !== JSON.stringify(this.registry[workerName], null, 2)
				) {
					this.registry[workerName] = JSON.parse(file);
					this.notifySubscribers(workerName);
				}
			} catch (e) {
				// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel process
				this.log?.debug(
					`Error while loading worker definition from the registry: ${e}`
				);
			}
		}
	}
}
