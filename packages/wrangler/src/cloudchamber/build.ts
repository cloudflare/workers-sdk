import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	buildAndMaybePushContainerImage,
	checkImagePlatform,
	initContainersSharedContext,
	resolveImageName,
	pushContainerImage,
} from "@cloudflare/containers-shared";
import {
	getDockerPath,
	isDirectory,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { cloudchamberScope, ensureCloudchamberApiAuth } from "./common";
import type { containersScope } from "../containers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type {
	ContainerNormalizedConfig,
	ContainersApiFamily,
	ImageRef,
	ImageURIConfig,
} from "@cloudflare/containers-shared";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export function buildYargs(yargs: CommonYargsArgv) {
	return yargs
		.positional("PATH", {
			type: "string",
			describe: "Path for the directory containing the Dockerfile to build",
			demandOption: true,
		})
		.option("tag", {
			alias: "t",
			type: "string",
			demandOption: true,
			describe: 'Name and optionally a tag (format: "name:tag")',
		})
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.option("push", {
			alias: "p",
			type: "boolean",
			describe: "Push the built image to Cloudflare's managed registry",
			default: false,
		})
		.option("platform", {
			type: "string",
			default: "linux/amd64",
			describe:
				"Platform to build for. Defaults to the architecture support by Workers (linux/amd64)",
			demandOption: false,
			hidden: true,
			deprecated: true,
		});
}

export function pushYargs(yargs: CommonYargsArgv) {
	return yargs
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.positional("TAG", { type: "string", demandOption: true });
}

/**
 * Builds a Docker image and optionally pushes it to the Cloudflare managed registry.
 *
 * @param args - Build arguments including tag, Dockerfile path, build context, and platform.
 * @param pathToDocker - Path to the Docker CLI executable.
 * @param push - Whether to push the built image to the remote registry.
 * @param containerConfig - Optional container configuration for limit validation.
 * @param verifyDockerIsRunning - When `true` (the default), verifies Docker is installed and the
 *   daemon is running before building. Set to `false` when the caller has already performed this check.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 *
 * @returns An {@link ImageRef} describing the built/pushed image.
 */
export async function buildAndMaybePush(
	args: Parameters<typeof buildAndMaybePushContainerImage>[0]["args"],
	pathToDocker: string,
	push: boolean,
	containerConfig?: Exclude<ContainerNormalizedConfig, ImageURIConfig>,
	verifyDockerIsRunning?: boolean,
	complianceConfig?: ComplianceConfig
): Promise<ImageRef> {
	try {
		return await buildAndMaybePushContainerImage({
			args,
			pathToDocker,
			push,
			containerConfig,
			verifyDockerIsRunning,
			complianceConfig,
			logger,
		});
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				cause: error,
				telemetryMessage: "cloudchamber build image operation failed",
			});
		}
		throw new UserError("An unknown error occurred", {
			telemetryMessage: "cloudchamber build unknown error",
		});
	}
}

/**
 * Builds an image from the Cloudchamber command arguments and optionally pushes it.
 *
 * @param args - Parsed Cloudchamber build command arguments.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns A promise that resolves when the build and optional push complete.
 */
export async function buildCommand(
	args: StrictYargsOptionsToInterface<typeof buildYargs>,
	complianceConfig?: Config,
	apiFamily: ContainersApiFamily = "cloudchamber",
	scope: typeof containersScope | typeof cloudchamberScope = cloudchamberScope
) {
	// TODO: merge args with Wrangler config if available
	if (existsSync(args.PATH) && !isDirectory(args.PATH)) {
		throw new UserError(
			`${args.PATH} is not a directory. Please specify a valid directory path.`,
			{ telemetryMessage: "cloudchamber build invalid path" }
		);
	}
	if (args.platform !== "linux/amd64") {
		throw new UserError(
			`Unsupported platform: Platform "${args.platform}" is unsupported. Please use "linux/amd64" instead.`,
			{ telemetryMessage: "cloudchamber build unsupported platform" }
		);
	}

	const pathToDockerfile = join(args.PATH, "Dockerfile");

	if (args.push && complianceConfig !== undefined) {
		initContainersSharedContext({
			accountId: await ensureCloudchamberApiAuth(complianceConfig, scope),
			apiFamily,
			fetchResult,
		});
	}
	await buildAndMaybePush(
		{
			tag: args.tag,
			pathToDockerfile,
			buildContext: args.PATH,
			platform: args.platform,
			// no option to add env vars at build time...?
		},
		getDockerPath() ?? args.pathToDocker,
		args.push,
		// this means we aren't validating defined limits for a container when building an image
		// we will, however, still validate the image size against account level disk limits
		undefined,
		undefined,
		complianceConfig
	);
}

export async function pushCommand(
	args: StrictYargsOptionsToInterface<typeof pushYargs>,
	config: Config,
	apiFamily: ContainersApiFamily = "cloudchamber",
	scope: typeof containersScope | typeof cloudchamberScope = cloudchamberScope
) {
	try {
		const accountId = await ensureCloudchamberApiAuth(config, scope);
		initContainersSharedContext({
			accountId,
			apiFamily,
			fetchResult,
		});

		const newTag = resolveImageName(accountId, args.TAG, config);
		const dockerPath = args.pathToDocker ?? getDockerPath();
		await checkImagePlatform(dockerPath, args.TAG);
		await pushContainerImage({
			imageTag: args.TAG,
			pathToDocker: dockerPath,
			complianceConfig: config,
			logger,
		});
		logger.log(`Pushed image: ${newTag}`);
	} catch (error) {
		if (error instanceof Error) {
			throw new UserError(error.message, {
				telemetryMessage: "cloudchamber push failed",
			});
		}

		throw new UserError("An unknown error occurred", {
			telemetryMessage: "cloudchamber push unknown error",
		});
	}
}

// --- New createCommand-based commands ---

export const cloudchamberBuildCommand = createCommand({
	metadata: {
		description: "Build a container image",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
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
		await buildCommand(args, config);
	},
});

export const cloudchamberPushCommand = createCommand({
	metadata: {
		description: "Push a local image to the Cloudflare managed registry",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: false,
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
		await pushCommand(args, config);
	},
});
