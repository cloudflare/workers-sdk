import { initContainersSharedContext } from "@cloudflare/containers-shared";
import { fetchResult } from "../cfetch";
import {
	buildAndMaybePush,
	buildCommand,
	pushCommand,
} from "../cloudchamber/build";
import { ensureCloudchamberApiAuth } from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { containersScope } from ".";
import type {
	ContainerNormalizedConfig,
	ImageRef,
	ImageURIConfig,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

// --- Command definitions ---

export const containersBuildCommand = createCommand({
	metadata: {
		description: "Build a container image",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	args: {
		PATH: {
			type: "string",
			describe: "Path for the directory containing the Dockerfile to build",
			demandOption: true,
		},
		tag: {
			alias: "t",
			type: "string",
			demandOption: true,
			describe: 'Name and optionally a tag (format: "name:tag")',
		},
		"path-to-docker": {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		},
		push: {
			alias: "p",
			type: "boolean",
			describe: "Push the built image to Cloudflare's managed registry",
			default: false,
		},
		platform: {
			type: "string",
			default: "linux/amd64",
			describe:
				"Platform to build for. Defaults to the architecture support by Workers (linux/amd64)",
			demandOption: false,
			hidden: true,
			deprecated: true,
		},
	},
	positionalArgs: ["PATH"],
	async handler(args, { config }) {
		await buildCommand(args, config, "containers", containersScope);
	},
});

export const containersPushCommand = createCommand({
	metadata: {
		description: "Push a local image to the Cloudflare managed registry",
		status: "stable",
		owner: "Product: Cloudchamber",
	},
	args: {
		TAG: {
			type: "string",
			demandOption: true,
			describe: "The tag of the local image to push",
		},
		"path-to-docker": {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		},
	},
	positionalArgs: ["TAG"],
	async handler(args, { config }) {
		await pushCommand(args, config, "containers", containersScope);
	},
});

// --- Helper functions ---

/**
 * Builds a configured container image and optionally pushes it to the managed registry.
 *
 * @param containerConfig - Normalized Dockerfile-based container configuration.
 * @param imageTag - Tag component that will be prefixed with the container name.
 * @param dryRun - Whether to build without pushing the image.
 * @param pathToDocker - Path to the Docker CLI executable.
 * @param verifyDockerIsRunning - Whether to verify Docker before building.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns An {@link ImageRef} describing the built or pushed image.
 */
export async function buildContainer(
	containerConfig: Exclude<ContainerNormalizedConfig, ImageURIConfig>,
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string,
	verifyDockerIsRunning?: boolean,
	complianceConfig?: Config
): Promise<ImageRef> {
	const imageFullName = containerConfig.name + ":" + imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	if (!dryRun) {
		if (complianceConfig === undefined) {
			throw new Error("Container image push requires Wrangler config");
		}
		initContainersSharedContext({
			accountId: await ensureCloudchamberApiAuth(
				complianceConfig,
				containersScope
			),
			apiFamily: "containers",
			fetchResult,
		});
	}

	return await buildAndMaybePush(
		{
			tag: imageFullName,
			pathToDockerfile: containerConfig.dockerfile,
			buildContext: containerConfig.image_build_context,
			args: containerConfig.image_vars,
		},
		pathToDocker,
		!dryRun,
		containerConfig,
		verifyDockerIsRunning,
		complianceConfig
	);
}
