import { buildImage } from "./build";
import {
	getCloudflareContainerRegistry,
	isCloudflareRegistryLink,
} from "./knobs";
import { dockerLoginManagedRegistry } from "./login";
import { ContainerDevOptions } from "./types";
import {
	checkExposedPorts,
	isDockerfile,
	runDockerCmd,
	verifyDockerInstalled,
} from "./utils";

export async function pullImage(
	dockerPath: string,
	options: ContainerDevOptions
) {
	await dockerLoginManagedRegistry(dockerPath);
	await runDockerCmd(dockerPath, [
		"pull",
		options.image,
		// All containers running on our platform need to be built for amd64 architecture, but by default docker pull seems to look for an image matching the host system, so we need to specify this here
		"--platform",
		"linux/amd64",
	]);
	// re-tag image with the expected dev-formatted image tag for consistency
	await runDockerCmd(dockerPath, ["tag", options.image, options.imageTag]);
}

/**
 *
 * Builds or pulls the container images for local development. This
 * will be called before starting the local development server, and by a rebuild
 * hotkey during development.
 *
 * Because this runs when local dev starts, we also do some validation here,
 * such as checking if the Docker CLI is installed, and if the container images
 * expose any ports.
 */
export async function prepareContainerImagesForDev(
	dockerPath: string,
	containerOptions: ContainerDevOptions[],
	configPath: string | undefined
) {
	if (process.platform === "win32") {
		throw new Error(
			"Local development with containers is currently not supported on Windows. You should use WSL instead. You can also set `enable_containers` to false if you do not need to develop the container part of your application."
		);
	}
	await verifyDockerInstalled(dockerPath);
	for (const options of containerOptions) {
		if (isDockerfile(options.image, configPath)) {
			await buildImage(dockerPath, options, configPath);
		} else {
			if (!isCloudflareRegistryLink(options.image)) {
				throw new Error(
					`Image "${options.image}" is a registry link but does not point to the Cloudflare container registry.\n` +
						`To use an existing image from another repository, see https://developers.cloudflare.com/containers/image-management/#using-existing-images`
				);
			}
			await pullImage(dockerPath, options);
		}
		await checkExposedPorts(dockerPath, options);
	}
}

/**
 * Resolve an image name to the full unambiguous name.
 *
 * For now, this only converts images stored in the managed registry to contain
 * the user's account ID in the path.
 */
export async function resolveImageName(
	accountId: string,
	image: string
): Promise<string> {
	let url: URL;
	try {
		url = new URL(`http://${image}`);
	} catch (_) {
		return image;
	}

	if (url.hostname !== getCloudflareContainerRegistry()) {
		return image;
	}

	if (url.pathname.startsWith(`/${accountId}`)) {
		return image;
	}

	return `${url.hostname}/${accountId}${url.pathname}`;
}
