// default cloudflare managed registry, can be overriden with the env var - CLOUDFLARE_CONTAINER_REGISTRY
export const getCloudflareContainerRegistry = () => {
	return process.env.CLOUDFLARE_CONTAINER_REGISTRY ?? "registry.cloudflare.com";
};
