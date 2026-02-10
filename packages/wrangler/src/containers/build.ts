import {
	buildAndMaybePush,
	buildCommand,
	pushCommand,
} from "../cloudchamber/build";
import { fillOpenAPIConfiguration } from "../cloudchamber/common";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { containersScope } from ".";
import type { ImageRef } from "../cloudchamber/build";
import type {
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "@cloudflare/containers-shared";

// --- Command definitions ---

export const containersBuildCommand = createCommand({
	metadata: {
		description: "Build a container image",
		status: "open beta",
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
		await fillOpenAPIConfiguration(config, containersScope);
		await buildCommand(args);
	},
});

export const containersPushCommand = createCommand({
	metadata: {
		description: "Push a local image to the Cloudflare managed registry",
		status: "open beta",
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
		await fillOpenAPIConfiguration(config, containersScope);
		await pushCommand(args, config);
	},
});

// --- Helper functions ---

export async function buildContainer(
	containerConfig: Exclude<ContainerNormalizedConfig, ImageURIConfig>,
	/** just the tag component. will be prefixed with the container name */
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string
): Promise<ImageRef> {
	const imageFullName = containerConfig.name + ":" + imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	return await buildAndMaybePush(
		{
			tag: imageFullName,
			pathToDockerfile: containerConfig.dockerfile,
			buildContext: containerConfig.image_build_context,
			args: containerConfig.image_vars,
		},
		pathToDocker,
		!dryRun,
		containerConfig
	);
}
