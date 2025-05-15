import { Logger, run } from "../../logger";
import { DevEnv } from "./DevEnv";
import type { StartDevWorkerInput, Worker } from "./types";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	return run(new Logger(), () => {
		const devEnv = new DevEnv();

		return devEnv.startWorker(options);
	});
}
