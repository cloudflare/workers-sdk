import type { StartDevWorkerInput, Worker } from "./types";

import { DevEnv } from "./DevEnv";

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
