import { getCloudflareComplianceRegion } from "@cloudflare/workers-utils";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";

// Will return the default cloudflare managed registry for the environment being used.
// If WRANGLER_API_ENVIRONMENT is set to "staging", it will return a staging registry.
// If CLOUDFLARE_COMPLIANCE_REGION is set to "fedramp_high", it will return a fedramp_high registry.
// If nothing is set, it will return the public production registry.
// Override the default registry by setting the env var CLOUDFLARE_CONTAINER_REGISTRY.
export const getCloudflareContainerRegistry = () => {
	// previously defaulted to registry.cloudchamber.cfdata.org
	const fed = getCloudflareComplianceRegion() === "fedramp_high" ? ".fed" : "";
	const env =
		process.env.WRANGLER_API_ENVIRONMENT === "staging" ? "staging." : "";

	return (
		process.env.CLOUDFLARE_CONTAINER_REGISTRY ??
		`${env}registry${fed}.cloudflare.com`
	);
};

/** Prefixes with the cloudflare-dev namespace. The name should be the container's DO classname, and the tag a build uuid. */
export const getDevContainerImageName = (name: string, tag: string) => {
	return `${MF_DEV_CONTAINER_PREFIX}/${name.toLowerCase()}:${tag}`;
};
