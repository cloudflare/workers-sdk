import {
	createDeployment as createDeploymentBase,
	fetchDeployableVersions as fetchDeployableVersionsBase,
	fetchDeploymentVersions as fetchDeploymentVersionsBase,
	fetchLatestDeployment as fetchLatestDeploymentBase,
	fetchLatestDeployments as fetchLatestDeploymentsBase,
	fetchVersion as fetchVersionBase,
	fetchVersions as fetchVersionsBase,
	patchNonVersionedScriptSettings as patchNonVersionedScriptSettingsBase,
} from "@cloudflare/deploy-helpers";
import type {
	ApiDeployment,
	ApiVersion,
	Percentage,
	VersionCache,
	VersionId,
} from "./types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

export type { NonVersionedScriptSettings } from "@cloudflare/deploy-helpers";

export async function fetchVersion(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionId: VersionId,
	versionCache?: VersionCache
): Promise<ApiVersion> {
	return fetchVersionBase(
		complianceConfig,
		accountId,
		workerName,
		versionId,
		versionCache
	);
}

export async function fetchVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionCache: VersionCache | undefined,
	...versionIds: VersionId[]
) {
	return fetchVersionsBase(
		complianceConfig,
		accountId,
		workerName,
		versionCache,
		versionIds
	);
}

export async function fetchLatestDeployments(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string
): Promise<ApiDeployment[]> {
	return fetchLatestDeploymentsBase(complianceConfig, accountId, workerName);
}

export async function fetchLatestDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string
): Promise<ApiDeployment | undefined> {
	return fetchLatestDeploymentBase(complianceConfig, accountId, workerName);
}

export async function fetchDeploymentVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	deployment: ApiDeployment | undefined,
	versionCache: VersionCache
): Promise<[ApiVersion[], Map<VersionId, Percentage>]> {
	return fetchDeploymentVersionsBase(
		complianceConfig,
		accountId,
		workerName,
		deployment,
		versionCache
	);
}

export async function fetchDeployableVersions(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionCache: VersionCache
): Promise<ApiVersion[]> {
	return fetchDeployableVersionsBase(
		complianceConfig,
		accountId,
		workerName,
		versionCache
	);
}

export async function createDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	versionTraffic: Map<VersionId, Percentage>,
	message: string | undefined,
	force?: boolean
) {
	return createDeploymentBase(
		complianceConfig,
		accountId,
		workerName,
		versionTraffic,
		message,
		force
	);
}

export async function patchNonVersionedScriptSettings(
	complianceConfig: ComplianceConfig,
	accountId: string,
	workerName: string,
	settings: Partial<
		import("@cloudflare/deploy-helpers").NonVersionedScriptSettings
	>
) {
	return patchNonVersionedScriptSettingsBase(
		complianceConfig,
		accountId,
		workerName,
		settings
	);
}
