import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { watch } from "chokidar";
import { getGlobalWranglerConfigPath } from "./global-wrangler-config-path";
import type { Config } from "./config";

export const SERVICE_REGISTRY_PATH = path.join(
	getGlobalWranglerConfigPath(),
	"registry"
);

export type WorkerRegistry = Record<string, WorkerDefinition>;

let workers: WorkerRegistry | undefined;

export type WorkerDefinition = {
	port: number | undefined;
	protocol: "http" | "https" | undefined;
	host: string | undefined;
	mode: "local" | "remote";
	headers?: Record<string, string>;
	durableObjects: { name: string; className: string }[];
	durableObjectsHost?: string;
	durableObjectsPort?: number;
};

async function loadWorkerDefinitions(): Promise<WorkerRegistry> {
	await mkdir(SERVICE_REGISTRY_PATH, { recursive: true });
	workers ??= {};
	const newWorkers = new Set<string>();
	const workerDefinitions = await readdir(SERVICE_REGISTRY_PATH);
	for (const file of workerDefinitions) {
		workers[file] = JSON.parse(
			await readFile(path.join(SERVICE_REGISTRY_PATH, file), "utf8")
		);
		newWorkers.add(file);
	}

	for (const worker of Object.keys(workers)) {
		if (!newWorkers.has(worker)) {
			delete workers[worker];
		}
	}
	return workers;
}

let watcher: ReturnType<typeof watch> | undefined;

// Start watching the filesystem for changes to worker definitions
export async function startWorkerRegistry() {
	watcher = watch(SERVICE_REGISTRY_PATH, {
		persistent: true,
	}).on("all", async () => {
		await loadWorkerDefinitions();
	});
}

/**
 * Stop the service registry.
 */
export async function stopWorkerRegistry() {
	await watcher?.close();
}

/**
 * Register a worker in the registry.
 */
export async function registerWorker(
	name: string,
	definition: WorkerDefinition
) {
	await mkdir(SERVICE_REGISTRY_PATH, { recursive: true });
	await writeFile(
		path.join(SERVICE_REGISTRY_PATH, name),
		JSON.stringify(definition, null, 2)
	);
}

/**
 * Unregister a worker from the registry.
 */
export async function unregisterWorker(name: string) {
	await unlink(path.join(SERVICE_REGISTRY_PATH, name));
}

/**
 * Get the state of the service registry.
 */
export async function getRegisteredWorkers(): Promise<WorkerRegistry> {
	if (!workers) await loadWorkerDefinitions();
	return workers as WorkerRegistry;
}

/**
 * a function that takes your serviceNames and durableObjectNames and returns a
 * list of the running workers that we're bound to
 */
export async function getBoundRegisteredWorkers({
	services,
	durableObjects,
}: {
	services: Config["services"] | undefined;
	durableObjects: Config["durable_objects"] | undefined;
}) {
	const serviceNames = (services || []).map(
		(serviceBinding) => serviceBinding.service
	);
	const durableObjectServices = (
		durableObjects || { bindings: [] }
	).bindings.map((durableObjectBinding) => durableObjectBinding.script_name);

	const workerDefinitions = await getRegisteredWorkers();
	const filteredWorkers = Object.fromEntries(
		Object.entries(workerDefinitions || {}).filter(
			([key, _value]) =>
				serviceNames.includes(key) || durableObjectServices.includes(key)
		)
	);
	return filteredWorkers;
}
