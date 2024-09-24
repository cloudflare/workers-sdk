import assert from "node:assert";
import { updateDevEnvRegistry } from "../../dev";
import { serializeWorkerRegistryDefinition } from "../../dev/local";
import { DevEnv } from "./DevEnv";
import type { WorkerDefinition } from "../../dev-registry";
import type { StartDevWorkerInput, Worker } from "./types";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}

export async function startMultiWorker(
	optionsArray: StartDevWorkerInput[],
	devEnv0: DevEnv
): Promise<DevEnv[]> {
	const workerRegistry = new Map<string, WorkerDefinition>();
	let prevRegistry: Record<string, WorkerDefinition> = {};
	async function updateWorkerRegistry(
		name: string,
		definition: WorkerDefinition
	) {
		workerRegistry.set(name, definition);

		if (!devEnvs) {
			return;
		}

		const nextRegistry = Object.fromEntries(workerRegistry);

		if (JSON.stringify(prevRegistry) !== JSON.stringify(nextRegistry)) {
			prevRegistry = nextRegistry;
			await Promise.all(
				devEnvs.map(async (devEnv) => {
					await updateDevEnvRegistry(
						devEnv,
						Object.fromEntries(workerRegistry)
					);
				})
			);
		}
	}

	const devEnvs = await Promise.all(
		optionsArray.map(async (options, workerIndex) => {
			const devEnv = workerIndex === 0 ? devEnv0 : new DevEnv();

			devEnv.runtimes.forEach((runtime) => {
				runtime.on("reloadComplete", async (reloadEvent) => {
					if (!reloadEvent.config.dev?.remote) {
						const { url } = await devEnv.proxy.ready.promise;
						const { name } = reloadEvent.config;
						assert(name); // default value "multi-worker-n" is defined below

						const definition = serializeWorkerRegistryDefinition(
							url,
							name,
							reloadEvent.proxyData.internalDurableObjects,
							reloadEvent.proxyData.entrypointAddresses
						);

						if (definition) {
							await updateWorkerRegistry(name, definition);
						}
					}
				});
			});

			await devEnv.config.set({
				// name: `multi-worker-${workerIndex + 1}`,
				...options,
				dev: {
					...options.dev,
					remote: false,
					inspector: { port: 0 },
					server: {
						...options.dev?.server,
						// port: options.dev?.server?.port ?? 0,
						// hostname: "localhost",
					},
				},
			});

			return devEnv;
		})
	);

	return devEnvs;
}
