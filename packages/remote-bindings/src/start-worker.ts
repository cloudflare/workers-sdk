import { DevEnv } from "./startDevWorker/DevEnv";
import type { StartDevWorkerOptions, Worker } from "./startDevWorker/types";

export type { Worker };

export async function startWorker(
	options: StartDevWorkerOptions
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
