import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { parentPort, workerData } from "node:worker_threads";
import { isFileNotFoundError } from "../../shared/error";
import { CoreHeaders } from "../../workers/core/constants";
import type {
	WorkflowStorageWorkerData,
	WorkflowStorageWorkerRequest,
	WorkflowStorageWorkerResponse,
} from "./storage";

assert(parentPort);
const port = parentPort;
const data = workerData as WorkflowStorageWorkerData;

type PendingWorkflowStorageDelete = {
	promise: Promise<void>;
	failed: boolean;
	deleted: boolean;
};

const WORKFLOW_STORAGE_EXTENSIONS = [".sqlite", ".sqlite-shm", ".sqlite-wal"];
const WORKFLOW_STORAGE_DELETE_RETRY_INTERVAL_MS = 50;
const WORKFLOW_STORAGE_DELETE_TIMEOUT_MS = 2_000;
const WORKFLOW_STORAGE_DELETE_ATTEMPTS =
	WORKFLOW_STORAGE_DELETE_TIMEOUT_MS /
		WORKFLOW_STORAGE_DELETE_RETRY_INTERVAL_MS +
	1;

function reportError(error: Error): void {
	const message: WorkflowStorageWorkerResponse = { type: "error", error };
	port.postMessage(message);
}

class WorkflowStorage {
	persistPath = data.persistPath;
	closing = false;
	#pendingWorkflowStorageDeletes = new Map<
		string,
		PendingWorkflowStorageDelete
	>();

	async handle(url: URL, method: string): Promise<Response> {
		if (method === "DELETE" || url.searchParams.has("waitForPendingDelete")) {
			return this.#handleLoopbackWorkflowStorageDeleteRequest(url);
		}
		return this.#handleLoopbackWorkflowStorageRequest(url);
	}

	async drain(): Promise<void> {
		await Promise.all(
			[...this.#pendingWorkflowStorageDeletes.values()].map(
				({ promise }) => promise
			)
		);
	}

	/** Lists persisted Workflow Engine instances with their file creation times. */
	async #handleLoopbackWorkflowStorageRequest(url: URL): Promise<Response> {
		const workflowName = decodeURIComponent(
			url.pathname.slice("/core/workflow-storage/".length)
		);
		assert(workflowName, "Workflow name is required");

		const workflowsPersistPath = this.persistPath;

		// Engine DOs are stored under: <persistPath>/miniflare-workflows-<name>/<hexId>.sqlite
		const uniqueKey = `miniflare-workflows-${workflowName}`;
		const namespacePath = path.join(workflowsPersistPath, uniqueKey);

		// Prevent directory traversal
		if (
			!namespacePath.startsWith(path.resolve(workflowsPersistPath) + path.sep)
		) {
			return new Response("Invalid workflow name", { status: 400 });
		}

		try {
			const dirEntries = await fs.promises.readdir(namespacePath, {
				withFileTypes: true,
			});
			// Include birthtimeMs so the handler can sort by file creation time
			// without resolving Engine DO metadata for every instance.
			const entries = await Promise.all(
				dirEntries.map(async (entry) => {
					let birthtimeMs = 0;
					if (entry.isFile()) {
						try {
							const stat = await fs.promises.stat(
								path.join(namespacePath, entry.name)
							);
							birthtimeMs = stat.birthtimeMs;
						} catch {
							// Ignore stat errors
						}
					}
					return {
						name: entry.name,
						type: entry.isDirectory()
							? ("directory" as const)
							: ("file" as const),
						birthtimeMs,
					};
				})
			);
			return Response.json(entries);
		} catch (e) {
			if (isFileNotFoundError(e)) {
				return new Response("Not Found", { status: 404 });
			}
			throw e;
		}
	}

	/** Removes an instance's SQLite files, retrying transient Windows locks. */
	async #deleteWorkflowStorageFiles(
		instancePath: string,
		pendingDelete: PendingWorkflowStorageDelete
	): Promise<void> {
		let firstError: unknown;
		let failed = false;
		for (const ext of WORKFLOW_STORAGE_EXTENSIONS) {
			const filePath = `${instancePath}${ext}`;
			for (
				let attempt = 0;
				attempt < WORKFLOW_STORAGE_DELETE_ATTEMPTS;
				attempt++
			) {
				try {
					await fs.promises.unlink(filePath);
					if (ext === ".sqlite") {
						pendingDelete.deleted = true;
					}
					break;
				} catch (error) {
					if (isFileNotFoundError(error)) {
						break;
					}
					const code =
						typeof error === "object" && error !== null && "code" in error
							? error.code
							: undefined;
					if (
						(code !== "EBUSY" && code !== "EPERM") ||
						attempt === WORKFLOW_STORAGE_DELETE_ATTEMPTS - 1
					) {
						if (!failed) {
							firstError = error;
							failed = true;
						}
						break;
					}
					await wait(WORKFLOW_STORAGE_DELETE_RETRY_INTERVAL_MS);
				}
			}
		}
		if (failed) {
			throw firstError;
		}
	}

	/** Runs a storage deletion after any earlier deletion for the same instance. */
	async #runWorkflowStorageDelete(
		instancePath: string,
		defer: boolean,
		pendingDelete: PendingWorkflowStorageDelete,
		previousDelete?: PendingWorkflowStorageDelete
	): Promise<void> {
		await previousDelete?.promise;
		pendingDelete.deleted = previousDelete?.deleted ?? false;
		if (defer) {
			await wait(100);
		}
		try {
			await this.#deleteWorkflowStorageFiles(instancePath, pendingDelete);
		} catch (error) {
			pendingDelete.failed = true;
			reportError(error instanceof Error ? error : new Error(String(error)));
		}
		if (
			!pendingDelete.failed &&
			this.#pendingWorkflowStorageDeletes.get(instancePath) === pendingDelete
		) {
			this.#pendingWorkflowStorageDeletes.delete(instancePath);
		}
	}

	/** Serializes storage deletions for one instance path. */
	#queueWorkflowStorageDelete(
		instancePath: string,
		defer: boolean
	): PendingWorkflowStorageDelete {
		const previousDelete =
			this.#pendingWorkflowStorageDeletes.get(instancePath);
		const pendingDelete: PendingWorkflowStorageDelete = {
			deleted: false,
			failed: false,
			promise: Promise.resolve(),
		};
		this.#pendingWorkflowStorageDeletes.set(instancePath, pendingDelete);
		pendingDelete.promise = this.#runWorkflowStorageDelete(
			instancePath,
			defer,
			pendingDelete,
			previousDelete
		);
		return pendingDelete;
	}

	/** Waits for a queued storage deletion, retrying one failed deletion. */
	async #waitForWorkflowStorageDelete(
		instancePath: string,
		retried = false
	): Promise<Response> {
		const pendingDelete = this.#pendingWorkflowStorageDeletes.get(instancePath);
		if (pendingDelete === undefined) {
			return new Response(null, { status: 204 });
		}
		await pendingDelete.promise;

		const latestDelete = this.#pendingWorkflowStorageDeletes.get(instancePath);
		if (latestDelete === undefined) {
			return new Response(null, { status: 204 });
		}
		if (latestDelete !== pendingDelete) {
			return this.#waitForWorkflowStorageDelete(instancePath, retried);
		}
		if (!pendingDelete.failed) {
			this.#pendingWorkflowStorageDeletes.delete(instancePath);
			return new Response(null, { status: 204 });
		}
		if (retried || this.closing) {
			return new Response("Failed to delete workflow instance", {
				status: 500,
			});
		}

		this.#queueWorkflowStorageDelete(instancePath, false);
		return this.#waitForWorkflowStorageDelete(instancePath, true);
	}

	/**
	 * Deletes a Workflow Engine DO instance by removing its .sqlite file
	 * (and any associated -shm/-wal files) from the persistence directory.
	 *
	 * @param url in format: /core/workflow-storage/<workflowName>/<hexId>
	 */
	async #handleLoopbackWorkflowStorageDeleteRequest(
		url: URL
	): Promise<Response> {
		const pathAfterPrefix = url.pathname.slice(
			"/core/workflow-storage/".length
		);
		const slashIndex = pathAfterPrefix.indexOf("/");

		const workflowName = decodeURIComponent(
			slashIndex === -1 ? pathAfterPrefix : pathAfterPrefix.slice(0, slashIndex)
		);
		const hexId =
			slashIndex === -1
				? null
				: decodeURIComponent(pathAfterPrefix.slice(slashIndex + 1));

		assert(workflowName, "Workflow name is required");
		if (url.searchParams.has("waitForPendingDelete") && !hexId) {
			return new Response("Instance ID is required", { status: 400 });
		}

		const workflowsPersistPath = this.persistPath;

		const uniqueKey = `miniflare-workflows-${workflowName}`;
		const namespacePath = path.join(workflowsPersistPath, uniqueKey);

		// Prevent directory traversal
		if (
			!namespacePath.startsWith(path.resolve(workflowsPersistPath) + path.sep)
		) {
			return new Response("Invalid workflow name", { status: 400 });
		}

		if (hexId) {
			const instancePath = path.join(namespacePath, hexId);
			if (!instancePath.startsWith(namespacePath + path.sep)) {
				return new Response("Invalid instance ID", { status: 400 });
			}

			if (url.searchParams.has("waitForPendingDelete")) {
				return this.#waitForWorkflowStorageDelete(instancePath);
			}

			const pendingDelete = this.#queueWorkflowStorageDelete(
				instancePath,
				url.searchParams.has("defer")
			);
			if (url.searchParams.has("defer")) {
				return new Response("Accepted", { status: 202 });
			}
			await pendingDelete.promise;
			if (pendingDelete.failed) {
				return new Response("Failed to delete workflow instance", {
					status: 500,
				});
			}
			if (!pendingDelete.deleted) {
				return new Response("Not Found", { status: 404 });
			}
		} else {
			// Delete ALL instances in the workflow
			try {
				const dirEntries = await fs.promises.readdir(namespacePath);
				await Promise.all(
					dirEntries
						.filter((name) =>
							WORKFLOW_STORAGE_EXTENSIONS.some((ext) => name.endsWith(ext))
						)
						.map((name) =>
							fs.promises.unlink(path.join(namespacePath, name)).catch(() => {})
						)
				);
			} catch (e) {
				if (!isFileNotFoundError(e)) {
					throw e;
				}
			}
		}

		return new Response("OK", { status: 200 });
	}
}

const storage = new WorkflowStorage();

async function handleRequest(
	request: http.IncomingMessage,
	response: http.ServerResponse
): Promise<void> {
	request.resume();
	try {
		const supplied = request.headers[CoreHeaders.LOOPBACK_SECRET.toLowerCase()];
		const actual = Buffer.from(typeof supplied === "string" ? supplied : "");
		const expected = Buffer.from(data.secret);
		const url = new URL(request.url ?? "/", "http://localhost");
		let result: Response;
		if (
			actual.byteLength !== expected.byteLength ||
			!crypto.timingSafeEqual(actual, expected)
		) {
			result = new Response("Forbidden", { status: 403 });
		} else if (!url.pathname.startsWith("/core/workflow-storage/")) {
			result = new Response("Not Found", { status: 404 });
		} else {
			result = await storage.handle(url, request.method ?? "GET");
		}
		response.writeHead(result.status, Object.fromEntries(result.headers));
		response.end(Buffer.from(await result.arrayBuffer()));
	} catch (error) {
		reportError(error instanceof Error ? error : new Error(String(error)));
		if (!response.headersSent) {
			response.writeHead(500);
		}
		response.end("Internal Server Error");
	}
}

const server = http.createServer((request, response) => {
	void handleRequest(request, response);
});
server.keepAliveTimeout = 0;
server.on("error", (error) => {
	throw error;
});
server.listen(0, "127.0.0.1", () => {
	const address = server.address();
	assert(address !== null && typeof address !== "string");
	const message: WorkflowStorageWorkerResponse = {
		type: "ready",
		address: `127.0.0.1:${address.port}`,
	};
	port.postMessage(message);
});

async function dispose(): Promise<void> {
	storage.closing = true;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error === undefined ? resolve() : reject(error)));
		server.closeAllConnections();
	});
	await storage.drain();
	port.close();
}

port.on("message", (message: WorkflowStorageWorkerRequest) => {
	if (message.type === "configure") {
		storage.persistPath = message.persistPath;
		const response: WorkflowStorageWorkerResponse = { type: "configured" };
		port.postMessage(response);
	} else {
		void dispose().catch((error: unknown) => {
			throw error;
		});
	}
});
