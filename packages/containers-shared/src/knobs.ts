import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getComplianceRegionSubdomain,
} from "@cloudflare/workers-utils";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Returns the managed container registry for the configured API environment and compliance region.
 *
 * @param complianceConfig - Compliance configuration used to select the public or FedRAMP registry.
 * @returns The managed registry hostname, respecting `CLOUDFLARE_CONTAINER_REGISTRY` and `WRANGLER_API_ENVIRONMENT`.
 */
export const getCloudflareContainerRegistry = (
	complianceConfig: ComplianceConfig = COMPLIANCE_REGION_CONFIG_UNKNOWN
): string => {
	// previously defaulted to registry.cloudchamber.cfdata.org
	if (process.env.CLOUDFLARE_CONTAINER_REGISTRY) {
		return process.env.CLOUDFLARE_CONTAINER_REGISTRY;
	}

	const environmentPrefix =
		process.env.WRANGLER_API_ENVIRONMENT === "staging" ? "staging." : "";
	const complianceRegionSubdomain =
		getComplianceRegionSubdomain(complianceConfig);

	return `${environmentPrefix}registry${complianceRegionSubdomain}.cloudflare.com`;
};

/** Prefixes with the cloudflare-dev namespace. The name should be the container's DO classname, and the tag a build uuid. */
export const getDevContainerImageName = (name: string, tag: string) => {
	return `${MF_DEV_CONTAINER_PREFIX}/${name.toLowerCase()}:${tag}`;
};

/**
 * Docker's FUSE requirements: expose the device, allow mounts through
 * `SYS_ADMIN`, and disable the entire default AppArmor profile because it
 * blocks FUSE mounts.
 */
export const FUSE_CONTAINER_PRIVILEGES = {
	capabilities: ["SYS_ADMIN"],
	devices: [
		{
			pathOnHost: "/dev/fuse",
			pathInContainer: "/dev/fuse",
			cgroupPermissions: "rwm",
		},
	],
	securityOpt: ["apparmor:unconfined"],
};
