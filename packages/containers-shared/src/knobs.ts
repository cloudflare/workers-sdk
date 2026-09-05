import { MF_DEV_CONTAINER_PREFIX } from "./registry";

export { getCloudflareContainerRegistry } from "@cloudflare/workers-utils/compliance";

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
