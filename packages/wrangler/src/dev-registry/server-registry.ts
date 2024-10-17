import events from "node:events";
import { createServer } from "node:http";
import net from "node:net";
import * as util from "node:util";
import bodyParser from "body-parser";
import express from "express";
import { createHttpTerminator } from "http-terminator";
import { fetch } from "undici";
import { logger } from "../logger";
import type { WorkerDefinition, WorkerRegistry } from "./types";
import type { watch } from "chokidar";
import type { HttpTerminator } from "http-terminator";
import type { Server } from "node:http";

let DEV_REGISTRY_PORT = parseInt(process.env.WRANGLER_WORKER_REGISTRY_PORT!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
if (Number.isNaN(DEV_REGISTRY_PORT)) {
	DEV_REGISTRY_PORT = 6284;
}
const DEV_REGISTRY_HOST = `http://127.0.0.1:${DEV_REGISTRY_PORT}`;
const jsonBodyParser = bodyParser.json();
let globalServer: Server | null;
let globalTerminator: HttpTerminator;

let globalWatcher: ReturnType<typeof watch> | undefined;
const heartbeats = new Map<string, ReturnType<typeof setTimeout>>();

export const ServerRegistry = {
	devRegistry,
	getRegisteredWorkers,
	registerWorker,
	startWorkerRegistry,
	startWorkerRegistryServer,
	stopWorkerRegistry,
	unregisterWorker,
};

async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	let previousRegistry: WorkerRegistry | undefined;
	let hasFailedToFetch = false;

	try {
		await startWorkerRegistry();
	} catch (err) {
		logger.error("failed to start worker registry", err);
	}

	const interval = setInterval(async () => {
		try {
			const registry = await getRegisteredWorkers();
			if (!util.isDeepStrictEqual(registry, previousRegistry)) {
				previousRegistry = registry;
				cb(registry);
			}
		} catch (err) {
			if (!hasFailedToFetch) {
				hasFailedToFetch = true;
				logger.warn("Failed to get worker definitions", err);
			}
		}
	}, 300);

	return async (name?: string) => {
		clearInterval(interval);
		try {
			const [unregisterResult, stopRegistryResult] = await Promise.allSettled([
				name ? unregisterWorker(name) : Promise.resolve(),
				stopWorkerRegistry(),
			]);
			if (unregisterResult.status === "rejected") {
				logger.error("Failed to unregister worker", unregisterResult.reason);
			}
			if (stopRegistryResult.status === "rejected") {
				logger.error(
					"Failed to stop worker registry",
					stopRegistryResult.reason
				);
			}
		} catch (err) {
			logger.error("Failed to cleanup dev registry", err);
		}
	};
}

/**
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<
	WorkerRegistry | undefined
> {
	try {
		const response = await fetch(`${DEV_REGISTRY_HOST}/workers`);
		return (await response.json()) as WorkerRegistry;
	} catch (e) {
		if (
			!["ECONNRESET", "ECONNREFUSED"].includes(
				(e as unknown as { cause?: { code?: string } }).cause?.code || "___"
			)
		) {
			throw e;
		}
	}
}

/**
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	/**
	 * Prevent the dev registry be closed.
	 */
	await startWorkerRegistry();
	try {
		return await fetch(`${DEV_REGISTRY_HOST}/workers/${name}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(definition),
		});
	} catch (e) {
		if (
			!["ECONNRESET", "ECONNREFUSED"].includes(
				(e as unknown as { cause?: { code?: string } }).cause?.code || "___"
			)
		) {
			logger.error("Failed to register worker in local service registry", e);
		} else {
			logger.debug("Failed to register worker in local service registry", e);
		}
	}
}

/**
 * Start the service registry. It's a simple server
 * that exposes endpoints for registering and unregistering
 * services, as well as getting the state of the registry.
 */
export async function startWorkerRegistry() {
	if ((await isPortAvailable()) && !globalServer) {
		const result = await startWorkerRegistryServer(DEV_REGISTRY_PORT);
		globalServer = result.server;
		globalTerminator = result.terminator;

		/**
		 * The registry server may have already been started by another wrangler process.
		 * If wrangler processes are run in parallel, isPortAvailable() can return true
		 * while another process spins up the server
		 */
		globalServer.once("error", (err) => {
			if ((err as unknown as { code: string }).code !== "EADDRINUSE") {
				throw err;
			}
		});

		/**
		 * The registry server may close. Reset the server to null for restart.
		 */
		globalServer.on("close", () => {
			globalServer = null;
		});
	}
}

export async function startWorkerRegistryServer(port: number) {
	const app = express();

	let workers: WorkerRegistry = {};
	app
		.get("/workers", async (req, res) => {
			res.json(workers);
		})
		.post("/workers/:workerId", jsonBodyParser, async (req, res) => {
			workers[req.params.workerId] = req.body;
			res.json(null);
		})
		.delete(`/workers/:workerId`, async (req, res) => {
			delete workers[req.params.workerId];
			res.json(null);
		})
		.delete("/workers", async (req, res) => {
			workers = {};
			res.json(null);
		});

	const appServer = createServer(app);
	const appTerminator = createHttpTerminator({ server: appServer });

	const listeningPromise = events.once(appServer, "listening");
	appServer.listen(port, "127.0.0.1");
	await listeningPromise;

	return { server: appServer, terminator: appTerminator };
}

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	if (globalWatcher) {
		await globalWatcher?.close();
		for (const heartbeat of heartbeats) {
			clearInterval(heartbeat[1]);
		}
		return;
	}
	await globalTerminator?.terminate();
	globalServer = null;
}

/**
 * Unregister a worker from the registry.
 */
export async function unregisterWorker(name: string) {
	try {
		await fetch(`${DEV_REGISTRY_HOST}/workers/${name}`, {
			method: "DELETE",
		});
	} catch (e) {
		if (
			!["ECONNRESET", "ECONNREFUSED"].includes(
				(e as unknown as { cause?: { code?: string } }).cause?.code || "___"
			)
		) {
			throw e;
			// logger.error("failed to unregister worker", e);
		}
	}
}

/**
 * A helper function to check whether our service registry is already running
 */
async function isPortAvailable() {
	return new Promise((resolve, reject) => {
		const netServer = net
			.createServer()
			.once("error", (err) => {
				netServer.close();
				if ((err as unknown as { code: string }).code === "EADDRINUSE") {
					resolve(false);
				} else {
					reject(err);
				}
			})
			.once("listening", () => {
				netServer.close();
				resolve(true);
			});
		netServer.listen(DEV_REGISTRY_PORT, "127.0.0.1");
	});
}
