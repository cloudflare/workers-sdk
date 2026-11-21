import { getCloudflareContainerRegistry } from "./knobs";
import type { ContainerNormalizedConfig } from "./types";
import type {
	ComplianceConfig,
	ContainerRegistryConfig,
} from "@cloudflare/workers-utils/compliance";

/**
 * Adds the Cloudflare account namespace to an image tag in the managed registry.
 *
 * @param accountID - Cloudflare account ID that owns the image.
 * @param tag - Image name and tag to namespace.
 * @param complianceConfig - Compliance region and image jurisdiction used to select the managed registry.
 * @returns The fully qualified managed-registry image reference.
 */
export const getCloudflareRegistryWithAccountNamespace = (
	accountID: string,
	tag: string,
	complianceConfig?: ContainerRegistryConfig
): string => {
	return `${getCloudflareContainerRegistry(complianceConfig)}/${accountID}/${tag}`;
};

/**
 * Selects the managed registry for a standard Container's images from its
 * `constraints.jurisdiction`.
 *
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @param container - Normalized standard Container configuration.
 * @returns The registry selection for the Container's images.
 */
export function getContainerRegistryConfig(
	complianceConfig: ComplianceConfig | undefined,
	container: Pick<ContainerNormalizedConfig, "constraints">
): ContainerRegistryConfig {
	return {
		compliance_region: complianceConfig?.compliance_region,
		jurisdiction: container.constraints.jurisdiction,
	};
}

export const MF_DEV_CONTAINER_PREFIX = "cloudflare-dev";
