import { DevEnv } from "./DevEnv";
import type { StartDevWorkerInput, Worker } from "./types";

export { convertConfigBindingsToStartWorkerBindings } from "./utils";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
