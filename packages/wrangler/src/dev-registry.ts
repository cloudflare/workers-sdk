import events from "node:events";
import { utimesSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import * as util from "node:util";
import bodyParser from "body-parser";
import { watch } from "chokidar";
import express from "express";
import { createHttpTerminator } from "http-terminator";
import { fetch } from "undici";
import { version as wranglerVersion } from "../package.json";
import { getFlag } from "./experimental-flags";
import { getGlobalWranglerConfigPath } from "./global-wrangler-config-path";
import { logger } from "./logger";
import type { Binding } from "./api";
import type { Config } from "./config";
import type { HttpTerminator } from "http-terminator";
import type { Server } from "node:http";

// Safety of `!`: `parseInt(undefined)` is NaN
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
let DEV_REGISTRY_PORT = parseInt(process.env.WRANGLER_WORKER_REGISTRY_PORT!);
if (Number.isNaN(DEV_REGISTRY_PORT)) {
	DEV_REGISTRY_PORT = 6284;
}
const DEV_REGISTRY_HOST = `http://127.0.0.1:${DEV_REGISTRY_PORT}`;

const DEV_REGISTRY_PATH = path.join(getGlobalWranglerConfigPath(), "registry");

let globalServer: Server | null;
let globalTerminator: HttpTerminator;

let globalWatcher: ReturnType<typeof watch> | undefined;
let globalWorkers: WorkerRegistry | undefined;

const heartbeats = new Map<string, ReturnType<typeof setTimeout>>();

export type WorkerRegistry = Record<string, WorkerDefinition>;

export type WorkerEntrypointsDefinition = Record<
	/* name */ "default" | string,
	{ host: string; port: number } | undefined
>;

export type WorkerDefinition = {
	port: number | undefined;
	protocol: "http" | "https" | undefined;
	host: string | undefined;
	mode: "local" | "remote";
	headers?: Record<string, string>;
	entrypointAddresses?: WorkerEntrypointsDefinition;
	durableObjects: { name: string; className: string }[];
	durableObjectsHost?: string;
	durableObjectsPort?: number;
};

async function loadWorkerDefinitions(): Promise<WorkerRegistry> {
	await mkdir(DEV_REGISTRY_PATH, { recursive: true });
	globalWorkers ??= {};
	const newWorkers = new Set<string>();
	const workerDefinitions = await readdir(DEV_REGISTRY_PATH);
	for (const workerName of workerDefinitions) {
		try {
			const file = await readFile(
				path.join(DEV_REGISTRY_PATH, workerName),
				"utf8"
			);
			const stats = await stat(path.join(DEV_REGISTRY_PATH, workerName));
			// Cleanup existing workers older than 10 minutes
			if (stats.mtime.getTime() < Date.now() - 600000) {
				await unregisterWorker(workerName);
			} else {
				globalWorkers[workerName] = JSON.parse(file);
				newWorkers.add(workerName);
			}
		} catch (e) {
			// This can safely be ignored. It generally indicates the worker was too old and was removed by a parallel Wrangler process
			logger.debug(
				"Error while loading worker definition from the registry",
				e
			);
		}
	}

	for (const worker of Object.keys(globalWorkers)) {
		if (!newWorkers.has(worker)) {
			delete globalWorkers[worker];
		}
	}
	return globalWorkers;
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

const jsonBodyParser = bodyParser.json();

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
 * Start the service registry. It's a simple server
 * that exposes endpoints for registering and unregistering
 * services, as well as getting the state of the registry.
 */
export async function startWorkerRegistry(
	listener?: (registry: WorkerRegistry | undefined) => void
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		globalWatcher ??= watch(DEV_REGISTRY_PATH, {
			persistent: true,
		}).on("all", async () => {
			await loadWorkerDefinitions();
			listener?.({ ...globalWorkers });
		});
		return;
	}
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

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	if (getFlag("FILE_BASED_REGISTRY") || globalWatcher) {
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
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		const existingHeartbeat = heartbeats.get(name);
		if (existingHeartbeat) {
			clearInterval(existingHeartbeat);
		}
		await mkdir(DEV_REGISTRY_PATH, { recursive: true });
		await writeFile(
			path.join(DEV_REGISTRY_PATH, name),
			// We don't currently do anything with the stored Wrangler version,
			// but if we need to make breaking changes to this format in the future
			// we can use this field to present useful messaging
			JSON.stringify({ ...definition, wranglerVersion }, null, 2)
		);
		heartbeats.set(
			name,
			setInterval(() => {
				utimesSync(path.join(DEV_REGISTRY_PATH, name), new Date(), new Date());
			}, 30_000)
		);
		return;
	}
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
 * Unregister a worker from the registry.
 */
export async function unregisterWorker(name: string) {
	if (getFlag("FILE_BASED_REGISTRY")) {
		try {
			await unlink(path.join(DEV_REGISTRY_PATH, name));
			const existingHeartbeat = heartbeats.get(name);
			if (existingHeartbeat) {
				clearInterval(existingHeartbeat);
			}
		} catch (e) {
			logger.debug("failed to unregister worker", e);
		}
		return;
	}
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
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<
	WorkerRegistry | undefined
> {
	if (getFlag("FILE_BASED_REGISTRY")) {
		globalWorkers = await loadWorkerDefinitions();
		return { ...globalWorkers };
	}

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
 * a function that takes your serviceNames and durableObjectNames and returns a
 * list of the running workers that we're bound to
 */
export async function getBoundRegisteredWorkers(
	{
		name,
		services,
		durableObjects,
	}: {
		name: string | undefined;
		services:
			| Config["services"]
			| Extract<Binding, { type: "service" }>[]
			| undefined;
		durableObjects:
			| Config["durable_objects"]
			| { bindings: Extract<Binding, { type: "durable_object_namespace" }>[] }
			| undefined;
	},
	existingWorkerDefinitions?: WorkerRegistry | undefined
): Promise<WorkerRegistry | undefined> {
	const serviceNames = (services || []).map(
		(serviceBinding) => serviceBinding.service
	);
	const durableObjectServices = (
		durableObjects || { bindings: [] }
	).bindings.map((durableObjectBinding) => durableObjectBinding.script_name);

	if (serviceNames.length === 0 && durableObjectServices.length === 0) {
		return {};
	}
	const workerDefinitions =
		existingWorkerDefinitions ?? (await getRegisteredWorkers());

	const filteredWorkers = Object.fromEntries(
		Object.entries(workerDefinitions || {}).filter(
			([key, _value]) =>
				key !== name && // Always exclude current worker to avoid infinite loops
				(serviceNames.includes(key) || durableObjectServices.includes(key))
		)
	);
	return filteredWorkers;
}

/**
 * A react-free version of the above hook
 */
export async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	let previousRegistry: WorkerRegistry | undefined;

	let interval: ReturnType<typeof setInterval>;

	let hasFailedToFetch = false;

	// The new file based registry supports a much more performant listener callback
	if (getFlag("FILE_BASED_REGISTRY")) {
		await startWorkerRegistry(async (registry) => {
			if (!util.isDeepStrictEqual(registry, previousRegistry)) {
				previousRegistry = registry;
				cb(registry);
			}
		});
	} else {
		try {
			await startWorkerRegistry();
		} catch (err) {
			logger.error("failed to start worker registry", err);
		}
		// Else we need to fall back to a polling based approach
		interval = setInterval(async () => {
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
	}

	return async (name) => {
		interval && clearInterval(interval);
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
