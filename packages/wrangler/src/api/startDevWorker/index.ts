import { DevEnv } from "./DevEnv";
import type { StartDevWorkerOptions, Worker } from "./types";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerOptions
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
