import { runWithAuth } from "../../user";
import { DevEnv } from "./DevEnv";
import type { StartDevWorkerInput, Worker } from "./types";

export { convertConfigBindingsToStartWorkerBindings } from "./utils";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	return runWithAuth(
		// Note: we set up the auth info as undefined since
		//       these will be updated in the ConfigController
		{
			accountId: undefined,
			apiCredentials: undefined,
		},
		() => {
			const devEnv = new DevEnv();
			return devEnv.startWorker(options);
		}
	);
}
