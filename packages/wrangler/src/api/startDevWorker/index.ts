import { DevEnv } from "./DevEnv";
import type { DevWorker, StartDevWorkerOptions } from "./types";

export { DevEnv };
export * from "./types";
export * from "./events";

export function startWorker(options: StartDevWorkerOptions): DevWorker {
	const devEnv = new DevEnv();

	return devEnv.startWorker(options);
}
