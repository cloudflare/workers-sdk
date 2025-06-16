import { readConfig } from "../../config";
import { runWithAuth } from "../../user";
import { DevEnv } from "./DevEnv";
import { unwrapHook } from "./utils";
import type { StartDevWorkerInput, Worker } from "./types";

export { convertConfigBindingsToStartWorkerBindings } from "./utils";

export { DevEnv };
export * from "./types";
export * from "./events";

export async function startWorker(
	options: StartDevWorkerInput
): Promise<Worker> {
	const startWorkerImpl = () => {
		const devEnv = new DevEnv();
		return devEnv.startWorker(options);
	};

	if (options.dev?.auth) {
		const inputAuth = await unwrapHook(options.dev.auth, readConfig(options));
		if (inputAuth) {
			return runWithAuth(
				{
					accountId: inputAuth.accountId,
					apiCredentials: inputAuth.apiToken,
				},
				startWorkerImpl
			);
		}
	}

	return startWorkerImpl();
}
