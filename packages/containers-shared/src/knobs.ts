import { MF_DEV_CONTAINER_PREFIX } from "./registry";

// default cloudflare managed registry, can be overriden with the env var - CLOUDFLARE_CONTAINER_REGISTRY
export const getCloudflareContainerRegistry = () => {
	return process.env.CLOUDFLARE_CONTAINER_REGISTRY ?? "registry.cloudflare.com";
};

/** Prefixes with the cloudflare-dev namespace. The name should be the container's DO classname, and the tag a build uuid. */
export const getDevContainerImageName = (name: string, tag: string) => {
	return `${MF_DEV_CONTAINER_PREFIX}/${name.toLowerCase()}:${tag}`;
};
