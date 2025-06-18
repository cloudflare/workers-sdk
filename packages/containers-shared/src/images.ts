import { execFile } from "child_process";
import { buildImage } from "./build";
import { dockerImageInspect } from "./inspect";
import {
	getCloudflareContainerRegistry,
	isCloudflareRegistryLink,
} from "./knobs";
import { dockerLoginManagedRegistry } from "./login";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import { ContainerDevOptions, Logger } from "./types";
import { isDockerfile, runDockerCmd, verifyLocalDevSupported } from "./utils";

// Returns a list of docker image ids matching the provided repository:[tag]
export async function getDockerImageDigest(
	dockerPath: string,
	imageTag: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			dockerPath,
			["images", "--digests", "--format", "{{.Digest}}", imageTag],
			(error, stdout, stderr) => {
				if (error) {
					return reject(
						new Error(
							`Failed getting docker image digest for image: ${imageTag} with error: ${error}.`
						)
					);
				}
				return resolve(stdout.trim());
			}
		);
	});
}

export async function pullImage(
	dockerPath: string,
	options: ContainerDevOptions
) {
	try {
		await dockerLoginManagedRegistry(dockerPath);
		await runDockerCmd(dockerPath, [
			"pull",
			options.image,
			"--platform",
			"linux/amd64",
		]);
		// const tag = `${MF_CONTAINER_PREFIX}/${options.name}`;
		// this needs to be tested cause we might have to extract the actual image tag
		await runDockerCmd(dockerPath, ["tag", options.image, options.imageTag]);
		// this.#logger.info(`Successfully pulled image: ${image}`);
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(error.message);
		}

		throw new Error(
			`An unknown error occurred while attempting to pull ${options.image} from the Cloudflare container registry`
		);
	}
}

export async function buildOrPullImages(
	dockerPath: string,
	logger: Logger,
	containerOptions: ContainerDevOptions[]
) {
	await verifyLocalDevSupported(dockerPath);
	logger.info("Loading container image(s)...");
	for (const options of containerOptions) {
		if (isDockerfile(options.image)) {
			await buildImage(dockerPath, options);
		} else {
			if (!isCloudflareRegistryLink(options.image)) {
				throw new Error(
					`Image "${options.image}" is a registry link but does not point to the Cloudflare container registry.\n` +
						`All images must use ${getCloudflareContainerRegistry()}, which is the default registry for Wrangler. To use an existing image from another repository, see https://developers.cloudflare.com/containers/image-management/#using-existing-images`
				);
			}
			await pullImage(dockerPath, options);
		}
		await checkExposedPorts(dockerPath, options.imageTag);
	}
	// Miniflare will log 'Ready on...' before the containers are built, but that is actually the proxy server.
	// The actual user worker's miniflare instance is blocked until the containers are built
	logger.info("Container(s) ready");
}

export async function checkExposedPorts(dockerPath: string, imageTag: string) {
	const output = await dockerImageInspect(dockerPath, {
		imageTag,
		formatString: "{{ len .Config.ExposedPorts }}",
	});
	if (output === "0" && process.platform !== "linux") {
		throw new Error(
			`The container "${imageTag.replace(MF_DEV_CONTAINER_PREFIX + "/", "")}" does not expose any ports.\n` +
				"To develop containers locally on non-Linux platforms, you must expose any ports that you call with `getTCPPort()` in your Dockerfile."
		);
	}
}
