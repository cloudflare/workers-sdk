import { buildImage } from "./build";
import { UserError } from "./error";
import {
	getCloudflareContainerRegistry,
	isCloudflareRegistryLink,
} from "./knobs";
import { dockerLoginManagedRegistry } from "./login";
import { getCloudflareRegistryWithAccountNamespace } from "./registry";
import {
	checkExposedPorts,
	cleanupDuplicateImageTags,
	runDockerCmd,
	verifyDockerInstalled,
} from "./utils";
import type { ContainerDevOptions, DockerfileConfig } from "./types";

export async function pullImage(
	dockerPath: string,
	options: Exclude<ContainerDevOptions, DockerfileConfig>
): Promise<{ abort: () => void; ready: Promise<void> }> {
	await dockerLoginManagedRegistry(dockerPath);
	const pull = runDockerCmd(dockerPath, [
		"pull",
		options.image_uri,
		// All containers running on our platform need to be built for amd64 architecture, but by default docker pull seems to look for an image matching the host system, so we need to specify this here
		"--platform",
		"linux/amd64",
	]);
	const ready = pull.ready.then(async ({ aborted }: { aborted: boolean }) => {
		if (!aborted) {
			// re-tag image with the expected dev-formatted image tag for consistency
			await runDockerCmd(dockerPath, [
				"tag",
				options.image_uri,
				options.image_tag,
			]);
		}
	});

	return {
		abort: () => {
			pull.abort();
		},
		ready,
	};
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
export async function prepareContainerImagesForDev(args: {
	dockerPath: string;
	containerOptions: ContainerDevOptions[];
	onContainerImagePreparationStart: (args: {
		containerOptions: ContainerDevOptions;
		abort: () => void;
	}) => void;
	onContainerImagePreparationEnd: (args: {
		containerOptions: ContainerDevOptions;
	}) => void;
}) {
	const {
		dockerPath,
		containerOptions,
		onContainerImagePreparationStart,
		onContainerImagePreparationEnd,
	} = args;
	let aborted = false;
	if (process.platform === "win32") {
		throw new UserError(
			"Local development with containers is currently not supported on Windows. You should use WSL instead. You can also set `enable_containers` to false if you do not need to develop the container part of your application."
		);
	}
	await verifyDockerInstalled(dockerPath);
	for (const options of containerOptions) {
		if ("dockerfile" in options) {
			const build = await buildImage(dockerPath, options);
			onContainerImagePreparationStart({
				containerOptions: options,
				abort: () => {
					aborted = true;
					build.abort();
				},
			});
			await build.ready;

			onContainerImagePreparationEnd({
				containerOptions: options,
			});
		} else {
			if (!isCloudflareRegistryLink(options.image_uri)) {
				throw new UserError(
					`Image "${options.image_uri}" is a registry link but does not point to the Cloudflare container registry.\n` +
						`To use an existing image from another repository, see https://developers.cloudflare.com/containers/platform-details/image-management/#using-pre-built-container-images`
				);
			}
			const pull = await pullImage(dockerPath, options);
			onContainerImagePreparationStart({
				containerOptions: options,
				abort: () => {
					aborted = true;
					pull.abort();
				},
			});
			await pull.ready;
			onContainerImagePreparationEnd({
				containerOptions: options,
			});
		}
		if (!aborted) {
			// Clean up duplicate image tags. This is scoped to cloudflare-dev only
			await cleanupDuplicateImageTags(dockerPath, options.image_tag);

			await checkExposedPorts(dockerPath, options);
		}
	}
}

/**
 * Resolve an image name to the full unambiguous name.
 *
 * image:tag -> prepend registry.cloudflare.com/accountid/
 * registry.cloudflare.com/image:tag -> registry.cloudlfare.com/accountid/image:tag
 * registry.cloudflare.com/accountid/image:tag -> no change
 * anyother-registry.com/anything -> no change
 */
export function resolveImageName(accountId: string, image: string): string {
	let url: URL | undefined;
	try {
		url = new URL(`http://${image}`);
	} catch {
		// Invalid URL
	}

	if (
		url === undefined ||
		(!url.host.match(/[:.]/) && url.hostname !== "localhost")
	) {
		// Not a valid URL so assume it is in the format image:tag and prepend the registry
		return getCloudflareRegistryWithAccountNamespace(accountId, image);
	}

	if (url.hostname !== getCloudflareContainerRegistry()) {
		// hostname not the managed registry, passthrough
		return image;
	}

	if (url.pathname.startsWith(`/${accountId}`)) {
		// is managed registry and has the account id, passthrough
		return image;
	}

	// check if already looks like it has an account id (32 char hex string)
	const accountIdPattern = /^\/([a-f0-9]{32})\//;
	const match = accountIdPattern.exec(url.pathname);
	if (match) {
		const foundAccountId = match[1];
		if (foundAccountId !== accountId) {
			throw new Error(
				`Image "${image}" does not belong to your account\nImage appears to belong to account: "${foundAccountId}"\nCurrent account: "${accountId}"`
			);
		}
		return image;
	}

	// is managed registry and doesn't have the account id,add it to the path
	return `${url.hostname}/${accountId}${url.pathname}`;
}
