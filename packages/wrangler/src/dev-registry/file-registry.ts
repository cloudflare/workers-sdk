import { utimesSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import * as util from "node:util";
import { watch } from "chokidar";
import { version as wranglerVersion } from "../../package.json";
import { getGlobalWranglerConfigPath } from "../global-wrangler-config-path";
import { logger } from "../logger";
import type { WorkerDefinition, WorkerRegistry } from "./types";

const DEV_REGISTRY_PATH = path.join(getGlobalWranglerConfigPath(), "registry");
const heartbeats = new Map<string, NodeJS.Timeout>();
let globalWorkers: WorkerRegistry | undefined;
let globalWatcher: ReturnType<typeof watch> | undefined;

export const FileRegistry = {
	devRegistry,
	getRegisteredWorkers,
	registerWorker,
	startWorkerRegistry,
	stopWorkerRegistry,
	unregisterWorker,
};

async function devRegistry(
	cb: (workers: WorkerRegistry | undefined) => void
): Promise<(name?: string) => Promise<void>> {
	let previousRegistry: WorkerRegistry | undefined;

	await startWorkerRegistry(async (registry) => {
		if (!util.isDeepStrictEqual(registry, previousRegistry)) {
			previousRegistry = registry;
			cb(registry);
		}
	});

	return async (name?: string) => {
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

async function startWorkerRegistry(
	cb?: (registry: WorkerRegistry | undefined) => void
) {
	globalWatcher ??= watch(DEV_REGISTRY_PATH, {
		persistent: true,
	}).on("all", async () => {
		await loadWorkerDefinitions();
		cb?.({ ...globalWorkers });
	});
	return;
}

async function stopWorkerRegistry() {
	if (globalWatcher) {
		await globalWatcher?.close();
		for (const heartbeat of heartbeats) {
			clearInterval(heartbeat[1]);
		}
		return;
	}
}

async function registerWorker(name: string, definition: WorkerDefinition) {
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

async function getRegisteredWorkers(): Promise<WorkerRegistry | undefined> {
	globalWorkers = await loadWorkerDefinitions();
	return { ...globalWorkers };
}

async function unregisterWorker(name: string) {
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

export async function loadWorkerDefinitions(): Promise<WorkerRegistry> {
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
