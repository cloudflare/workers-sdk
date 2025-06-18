import { MF_DEV_CONTAINER_PREFIX } from "./registry";

// default cloudflare managed registry, can be overriden with the env var - CLOUDFLARE_CONTAINER_REGISTRY
export const getCloudflareContainerRegistry = () => {
	return process.env.CLOUDFLARE_CONTAINER_REGISTRY ?? "registry.cloudflare.com";
};

export const getDevContainerImageName = (name: string, tag: string) => {
	return `${MF_DEV_CONTAINER_PREFIX}/${name.toLowerCase()}:${tag}`;
};
