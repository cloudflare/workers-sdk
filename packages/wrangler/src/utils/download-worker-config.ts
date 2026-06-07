import {
	downloadWorkerConfig as downloadWorkerConfigBase,
	fetchWorkerConfig as fetchWorkerConfigBase,
} from "@cloudflare/deploy-helpers";
import type { RawConfig } from "@cloudflare/workers-utils";

export async function fetchWorkerConfig(
	accountId: string,
	workerName: string,
	environment: string
) {
	return fetchWorkerConfigBase(accountId, workerName, environment);
}

export async function downloadWorkerConfig(
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string
): Promise<RawConfig> {
	return downloadWorkerConfigBase(
		workerName,
		environment,
		entrypoint,
		accountId
	);
}
