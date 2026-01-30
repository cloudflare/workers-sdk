import { UserError } from "@cloudflare/workers-utils";
import { buildImage } from "./build";
import { ExternalRegistryKind } from "./client/models/ExternalRegistryKind";
import { getCloudflareContainerRegistry } from "./knobs";
import { dockerLoginImageRegistry } from "./login";
import { getCloudflareRegistryWithAccountNamespace } from "./registry";
import {
	checkExposedPorts,
	cleanupDuplicateImageTags,
	runDockerCmd,
	verifyDockerInstalled,
} from "./utils";
import type {
	ContainerDevOptions,
	DockerfileConfig,
	ViteLogger,
	WranglerLogger,
} from "./types";

export async function pullImage(
	dockerPath: string,
	options: Exclude<ContainerDevOptions, DockerfileConfig>,
	logger: WranglerLogger | ViteLogger,
	isVite: boolean
): Promise<{ abort: () => void; ready: Promise<void> }> {
	const domain = new URL(`http://${options.image_uri}`).hostname;

	const isExternalRegistry = domain !== getCloudflareContainerRegistry();
	try {
		// this will fail in two cases:
		// 1. this is being called from the vite plugin (doesn't have the appropriate auth context)
		// 2. the user has not run `wrangler containers registries configure` yet to set up credentials
		await dockerLoginImageRegistry(dockerPath, domain);
	} catch (e) {
		if (!isExternalRegistry) {
			if (isVite) {
				throw new UserError(
					`Using images from the Cloudflare-managed registry is not currently supported with the Vite plugin.\n` +
						`You should use a Dockerfile or a supported external registry and authenticate to that registry separately using \`docker login\` or similar.\n` +
						`Supported external registries are currently: ${Object.values(ExternalRegistryKind).join(", ")}.`
				);
			}
			throw e;
		}
		logger?.warn(
			"Unable to retrieve configured registry credentials from Cloudflare." +
				"\nUnless this is a public image, you will need to run `wrangler containers registries configure` before deploying." +
				"\nAttempting to pull image anyway..."
		);
	}

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
	logger: WranglerLogger | ViteLogger;
	isVite: boolean;
}): Promise<void> {
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
			const pull = await pullImage(
				dockerPath,
				options,
				args.logger,
				args.isVite
			);
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

/**
 * Get type of container registry, and validate.
 * Currently we support Cloudflare managed registries and AWS ECR.
 * When using Cloudflare managed registries we expect CLOUDFLARE_CONTAINER_REGISTRY to be set
 */
export const getAndValidateRegistryType = (domain: string): RegistryPattern => {
	// TODO: use parseImageName when that gets moved to this package
	if (domain.includes("://")) {
		throw new Error(
			`${domain} is invalid:\nImage reference should not include the protocol part (e.g: registry.cloudflare.com rather than https://registry.cloudflare.com)`
		);
	}
	let url: URL;
	try {
		url = new URL(`http://${domain}`);
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`${domain} is invalid:\n${e.message}`);
		}
		throw e;
	}

	const acceptedRegistries: RegistryPattern[] = [
		{
			type: ExternalRegistryKind.ECR,
			pattern: /^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$/,
			name: "AWS ECR",
			secretType: "AWS Secret Access Key",
		},
		{
			type: "cloudflare",
			// Make a regex based on the env var CLOUDFLARE_CONTAINER_REGISTRY
			pattern: new RegExp(
				`^${getCloudflareContainerRegistry().replace(/[\\.]/g, "\\$&")}$`
			),
			name: "Cloudflare Containers Managed Registry",
		},
	];

	const match = acceptedRegistries.find((registry) =>
		registry.pattern.test(url.hostname)
	);

	if (!match) {
		const supportedRegistries = acceptedRegistries
			.filter((r) => r.type !== "cloudflare")
			.map((r) => r.name)
			.join(", ");
		throw new UserError(
			`${url.hostname} is not a supported image registry.\nCurrently we support the following non-Cloudflare registries: ${supportedRegistries}.\nTo use an existing image from another repository, see https://developers.cloudflare.com/containers/platform-details/image-management/#using-pre-built-container-images`
		);
	}

	return match;
};

interface RegistryPattern {
	type: ExternalRegistryKind | "cloudflare";
	secretType?: string;
	pattern: RegExp;
	name: string;
}
