import { MF_DEV_CONTAINER_PREFIX } from "./registry";

// default cloudflare managed registry, can be overriden with the env var - CLOUDFLARE_CONTAINER_REGISTRY
export const getCloudflareContainerRegistry = () => {
	// previously defaulted to registry.cloudchamber.cfdata.org
	return process.env.CLOUDFLARE_CONTAINER_REGISTRY ?? "registry.cloudflare.com";
};

/**
 * Given a container image that is a registry link, this function
 * returns true if the link points the Cloudflare container registry
 * (defined as per `getCloudflareContainerRegistry` above)
 */
export function isCloudflareRegistryLink(image: string) {
	const cfRegistry = getCloudflareContainerRegistry();
	return image.includes(cfRegistry);
}

/** Prefixes with the cloudflare-dev namespace. The name should be the container's DO classname, and the tag a build uuid. */
export const getDevContainerImageName = (name: string, tag: string) => {
	return `${MF_DEV_CONTAINER_PREFIX}/${name.toLowerCase()}:${tag}`;
};
