import assert from "node:assert";
import path from "node:path";
import { prepareContainerImagesForDev } from "@cloudflare/containers-shared/src/images";
import { getDevContainerImageName } from "@cloudflare/containers-shared/src/knobs";
import { isDockerfile } from "@cloudflare/containers-shared/src/utils";
import type { WorkerConfig } from "./plugin-config";

/**
 * Returns the path to the Docker executable as defined by the
 * `WRANGLER_DOCKER_BIN` environment variable, or the default value
 * `"docker"`
 */
export function getDockerPath(): string {
	const defaultDockerPath = "docker";
	const dockerPathEnvVar = "WRANGLER_DOCKER_BIN";

	return process.env[dockerPathEnvVar] || defaultDockerPath;
}

/**
 * @returns Container options suitable for building or pulling images,
 * with image tag set to well-known dev format, or undefined if
 * containers are not enabled or not configured.
 */
async function getContainerOptions(options: {
	containersConfig: WorkerConfig["containers"];
	isContainersEnabled: boolean;
	containerBuildId: string;
	configPath?: string;
}) {
	const {
		containersConfig,
		isContainersEnabled,
		containerBuildId,
		configPath,
	} = options;

	if (!containersConfig?.length || isContainersEnabled === false) {
		return undefined;
	}

	return containersConfig.map((container) => {
		if (isDockerfile(container.image, configPath)) {
			return {
				dockerfile: container.image,
				image_build_context:
					container.image_build_context ?? path.dirname(container.image),
				image_vars: container.image_vars,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			};
		} else {
			return {
				image_uri: container.image,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			};
		}
	});
}

/**
 * Builds or pulls the container images for local development, and returns the
 * corresponding list of image tags
 *
 * @param options.containersConfig The configured containers
 * @param options.containerBuildId The container build id
 * @param options.isContainersEnabled Whether containers is enabled for this Worker
 * @param options.dockerPath The path to the Docker executable
 * @param options.configPath The path of the wrangler configuration file
 * @returns The list of image tags corresponding to the built/pulled container images
 */
export async function prepareContainerImages(options: {
	containersConfig: WorkerConfig["containers"];
	containerBuildId?: string;
	isContainersEnabled: boolean;
	dockerPath: string;
	configPath?: string;
}): Promise<Set<string>> {
	assert(
		options.containerBuildId,
		"Build ID should be set if containers are enabled and defined"
	);

	const {
		containersConfig,
		isContainersEnabled,
		dockerPath,
		containerBuildId,
		configPath,
	} = options;
	const uniqueImageTags = new Set<string>();

	// Assemble container options and build if necessary
	const containerOptions = await getContainerOptions({
		containersConfig,
		containerBuildId,
		isContainersEnabled,
		configPath,
	});

	if (containerOptions) {
		// keep track of them so we can clean up later
		for (const container of containerOptions) {
			uniqueImageTags.add(container.image_tag);
		}

		await prepareContainerImagesForDev({
			dockerPath,
			containerOptions,
			onContainerImagePreparationStart: () => {},
			onContainerImagePreparationEnd: () => {},
		});
	}

	return uniqueImageTags;
}
