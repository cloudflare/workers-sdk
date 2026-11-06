import {
	downloadWorkerConfig as downloadWorkerConfigBase,
	fetchWorkerConfig as fetchWorkerConfigBase,
} from "@cloudflare/deploy-helpers";
import type { ComplianceConfig, RawConfig } from "@cloudflare/workers-utils";

export async function fetchWorkerConfig(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	environment: string,
	fetchRoutes: boolean,
	fetchCustomDomains: boolean
) {
	return fetchWorkerConfigBase(
		complianceConfig,
		accountId,
		workerName,
		environment,
		fetchRoutes,
		fetchCustomDomains
	);
}

export async function downloadWorkerConfig(
	complianceConfig: ComplianceConfig,
	workerName: string,
	environment: string,
	entrypoint: string,
	accountId: string,
	fetchRoutes: boolean,
	fetchCustomDomains: boolean
): Promise<RawConfig> {
	return downloadWorkerConfigBase(
		complianceConfig,
		workerName,
		environment,
		entrypoint,
		accountId,
		fetchRoutes,
		fetchCustomDomains
	);
}
