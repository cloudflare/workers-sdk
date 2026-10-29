import {
	downloadWorkerConfig as downloadWorkerConfigBase,
	fetchWorkerConfig as fetchWorkerConfigBase,
} from "@cloudflare/deploy-helpers";
import type { ComplianceConfig, RawConfig } from "@cloudflare/workers-utils";

export async function fetchWorkerConfig(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	environment: string
) {
	return fetchWorkerConfigBase(
		complianceConfig,
		accountId,
		workerName,
		environment
	);
}

export async function downloadWorkerConfig(
	complianceConfig: ComplianceConfig,
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string
): Promise<RawConfig> {
	return downloadWorkerConfigBase(
		complianceConfig,
		workerName,
		environment,
		entrypoint,
		accountId
	);
}
