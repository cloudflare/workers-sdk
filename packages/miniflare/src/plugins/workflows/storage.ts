import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { fetch } from "../../http";
import { CoreHeaders, DeferredPromise } from "../../workers";
import type { Response } from "../../http";

export const SERVICE_WORKFLOW_STORAGE = "workflows:storage-loopback";

export interface WorkflowStorageWorkerData {
	persistPath: string;
	secret: string;
}

export type WorkflowStorageWorkerRequest =
	| { type: "configure"; persistPath: string }
	| { type: "dispose" };

export type WorkflowStorageWorkerResponse =
	| { type: "ready"; address: string }
	| { type: "configured" }
	| { type: "error"; error: Error };

/** Hosts Workflow filesystem operations independently of synchronous RPC calls. */
export class WorkflowStorageServer {
	readonly #worker: Worker;
	readonly #secret: string;
	readonly #ready = new DeferredPromise<string>();
	readonly #exit = new DeferredPromise<number>();
	#configured?: DeferredPromise<void>;
	#configuration: Promise<void> = Promise.resolve();
	#persistPath: string;
	#failure?: Error;
	#disposed = false;

	constructor(
		persistPath: string,
		secret: string,
		logError: (error: Error) => void
	) {
		this.#persistPath = persistPath;
		this.#secret = secret;
		const workerData: WorkflowStorageWorkerData = { persistPath, secret };
		const entry = pathToFileURL(
			path.join(__dirname, "plugins/workflows/storage-worker.js")
		);
		this.#worker = new Worker(
			new URL(
				`data:text/javascript,${encodeURIComponent(`import ${JSON.stringify(entry.href)};`)}`
			),
			{ workerData }
		);
		void this.#ready.catch(() => {});
		this.#worker.on("message", (message: WorkflowStorageWorkerResponse) => {
			if (message.type === "ready") {
				this.#ready.resolve(message.address);
			} else if (message.type === "configured") {
				this.#configured?.resolve();
			} else {
				logError(message.error);
			}
		});
		this.#worker.on("error", (error: Error) => {
			this.#failure = error;
			this.#ready.reject(error);
			this.#configured?.reject(error);
		});
		this.#worker.on("exit", (code) => {
			if (!this.#disposed || code !== 0) {
				this.#failure ??= new Error(
					`Workflow storage worker exited unexpectedly (${code})`
				);
				this.#ready.reject(this.#failure);
				this.#configured?.reject(this.#failure);
			}
			this.#exit.resolve(code);
		});
	}

	/** Updates the storage root before a runtime reload, retaining pending deletions. */
	async configure(persistPath: string): Promise<string> {
		const address = await this.#ready;
		this.#configuration = this.#configuration.then(async () => {
			assert(!this.#disposed, "Workflow storage server is disposed");
			if (this.#failure !== undefined) {
				throw this.#failure;
			}
			if (persistPath === this.#persistPath) {
				return;
			}
			this.#configured = new DeferredPromise<void>();
			const message: WorkflowStorageWorkerRequest = {
				type: "configure",
				persistPath,
			};
			this.#worker.postMessage(message);
			await this.#configured;
			this.#persistPath = persistPath;
		});
		await this.#configuration;
		return address;
	}

	/** Forwards Explorer requests to the same storage server used by Workflows. */
	async fetch(url: URL, method: string): Promise<Response> {
		const address = await this.#ready;
		await this.#configuration;
		if (this.#failure !== undefined) {
			throw this.#failure;
		}
		assert(!this.#disposed, "Workflow storage server is disposed");
		const target = new URL(url.pathname + url.search, `http://${address}`);
		return fetch(target, {
			method,
			headers: { [CoreHeaders.LOOPBACK_SECRET]: this.#secret },
		});
	}

	/** Stops accepting requests and drains pending deletions before terminating. */
	async dispose(): Promise<void> {
		if (!this.#disposed) {
			this.#disposed = true;
			await this.#ready.catch(() => {});
			if (this.#failure === undefined) {
				const message: WorkflowStorageWorkerRequest = { type: "dispose" };
				this.#worker.postMessage(message);
			}
		}
		const code = await this.#exit;
		if (code !== 0) {
			throw (
				this.#failure ?? new Error(`Workflow storage worker exited (${code})`)
			);
		}
	}
}
