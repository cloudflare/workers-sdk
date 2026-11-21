import type { ComplianceConfig } from "./environment-variables/misc-variables";

export {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	CONTAINER_REGISTRY_JURISDICTIONS,
	getCloudflareApiBaseUrl,
	getCloudflareContainerRegistries,
	getCloudflareContainerRegistry,
	getCloudflareComplianceRegion,
	getComplianceRegionSubdomain,
	getContainerImageRegistryConfigs,
	isCloudflareContainerRegistry,
} from "./environment-variables/misc-variables";
export type {
	ComplianceConfig,
	ContainerRegistryConfig,
} from "./environment-variables/misc-variables";

/**
 * Converts the compliance region of a `cloudflare.config.ts` to the form that
 * Cloudflare's API and the Containers tooling take.
 *
 * @param region The config's `complianceRegion`.
 * @returns The same region in `ComplianceConfig` form.
 */
export function toApiComplianceRegion(
	region: "public" | "fedramp-high" | undefined
): ComplianceConfig["compliance_region"] {
	return region === "fedramp-high" ? "fedramp_high" : region;
}
