import { DevEnv } from "./DevEnv";
import type { Worker, WranglerStartDevWorkerInput } from "./types";

export { convertConfigBindingsToStartWorkerBindings } from "./binding-utils";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: WranglerStartDevWorkerInput
): Promise<Worker> {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
