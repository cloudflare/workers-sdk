import { getCloudflareContainerRegistry } from "./knobs";

// The Cloudflare managed registry is special in that the namesapces for repos should always
// start with the Cloudflare Account tag
// This is a helper to generate the image tag with correct namespace attached to the Cloudflare Registry host
export const getCloudflareRegistryWithAccountNamespace = (
	accountID: string,
	tag: string
): string => {
	return `${getCloudflareContainerRegistry()}/${accountID}/${tag}`;
};

export const MF_DEV_CONTAINER_PREFIX = "cloudflare-dev";
