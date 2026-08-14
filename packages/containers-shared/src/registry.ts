import { getCloudflareContainerRegistry } from "./knobs";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Adds the Cloudflare account namespace to an image tag in the managed registry.
 *
 * @param accountID - Cloudflare account ID that owns the image.
 * @param tag - Image name and tag to namespace.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns The fully qualified managed-registry image reference.
 */
export const getCloudflareRegistryWithAccountNamespace = (
	accountID: string,
	tag: string,
	complianceConfig?: ComplianceConfig
): string => {
	return `${getCloudflareContainerRegistry(complianceConfig)}/${accountID}/${tag}`;
};

export const MF_DEV_CONTAINER_PREFIX = "cloudflare-dev";
