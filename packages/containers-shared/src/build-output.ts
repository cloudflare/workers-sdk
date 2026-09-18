import crypto from "node:crypto";
import path from "node:path";
import {
	cleanBuildOutputDir,
	writeContainerConfig,
} from "@cloudflare/build-output-utils";
import { UserError } from "@cloudflare/workers-utils/errors";
import {
	cleanupBuiltImages,
	normalizeContainerImageRepositoryName,
	startContainerBuild,
} from "./build";
import { runDockerCmdWithOutput, verifyDockerInstalled } from "./utils";
import type { WriteContainerConfigOptions } from "@cloudflare/build-output-utils";
import type {
	ParsedInputContainerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";

type InputContainerImage = Extract<
	ParsedInputContainerConfig,
	{ image: unknown }
>["image"];

type OutputContainerImage = Extract<
	ParsedOutputContainerConfig,
	{ image: unknown }
>["image"];

const BUILD_OUTPUT_IMAGE_NAMESPACE = "cloudflare-build";
const DOCKER_REPOSITORY_NAME_LENGTH = 255;

/**
 * Builds and writes the Container portion of the Build Output Specification.
 *
 * Registry references pass through unchanged. Locally built tags are retained
 * on success so a later deploy can resolve each emitted `localReference`.
 *
 * @param options - The validated Container configs and Docker build environment.
 */
export async function buildAndWriteContainerOutput(options: {
	containers: Record<string, ParsedInputContainerConfig>;
	root: string;
	pathToDocker: string;
}): Promise<void> {
	const containers = Object.entries(options.containers);
	await cleanupPreviousBuildOutputImageTags({
		root: options.root,
		pathToDocker: options.pathToDocker,
	});

	const buildId = createBuildId();
	const localTags = new Set<string>();
	try {
		const dockerfileCount = countDockerfiles(containers);
		if (dockerfileCount > 0) {
			await verifyDockerInstalled({
				dockerPath: options.pathToDocker,
				operation: "building the project",
				imageNoun:
					dockerfileCount === 1
						? "the configured image"
						: "the configured images",
			});
		}

		const outputConfigs: WriteContainerConfigOptions[] = [];
		try {
			for (const [directoryName, config] of containers) {
				outputConfigs.push({
					root: options.root,
					directoryName,
					config: await buildContainerOutputConfig({
						config,
						root: options.root,
						pathToDocker: options.pathToDocker,
						buildId,
						localTags,
					}),
				});
			}
		} catch (error) {
			throwBuildError(error);
		}

		for (const outputConfig of outputConfigs) {
			await writeContainerConfig(outputConfig);
		}
	} catch (error) {
		await Promise.allSettled([
			cleanBuildOutputDir(options.root),
			cleanupBuiltImages(
				Array.from(localTags, (localTag) => ({ localTag })),
				options.pathToDocker
			),
		]);
		throw error;
	}
}

async function buildContainerOutputConfig(options: {
	config: ParsedInputContainerConfig;
	root: string;
	pathToDocker: string;
	buildId: string;
	localTags: Set<string>;
}): Promise<ParsedOutputContainerConfig> {
	if (options.config.schedulingPolicy === "durable-object") {
		if (options.config.images === undefined) {
			return { ...options.config, images: undefined };
		}

		const images: NonNullable<
			Extract<
				ParsedOutputContainerConfig,
				{ schedulingPolicy: "durable-object" }
			>["images"]
		> = {};
		for (const [imageName, image] of Object.entries(options.config.images)) {
			images[imageName] = await buildContainerImage({
				image,
				repositoryName: `${options.config.name}-${imageName}`,
				root: options.root,
				pathToDocker: options.pathToDocker,
				buildId: options.buildId,
				localTags: options.localTags,
			});
		}
		return { ...options.config, images };
	}

	const image = await buildContainerImage({
		image: options.config.image,
		repositoryName: options.config.name,
		root: options.root,
		pathToDocker: options.pathToDocker,
		buildId: options.buildId,
		localTags: options.localTags,
	});
	return { ...options.config, image };
}

async function buildContainerImage(options: {
	image: InputContainerImage;
	repositoryName: string;
	root: string;
	pathToDocker: string;
	buildId: string;
	localTags: Set<string>;
}): Promise<OutputContainerImage> {
	if ("reference" in options.image) {
		return { reference: options.image.reference };
	}

	const pathToDockerfile = path.resolve(options.root, options.image.dockerfile);
	const localTag = createBuildOutputImageTag({
		root: options.root,
		repositoryName: options.repositoryName,
		buildId: options.buildId,
	});
	if (options.localTags.has(localTag)) {
		throw new UserError(
			`Container image name ${JSON.stringify(options.repositoryName)} conflicts with another image after Docker name normalization.`,
			{ telemetryMessage: "container build output image name conflict" }
		);
	}
	const build = await startContainerBuild({
		build: {
			tag: localTag,
			pathToDockerfile,
			buildContext:
				options.image.buildContext === undefined
					? path.dirname(pathToDockerfile)
					: path.resolve(options.root, options.image.buildContext),
			args: options.image.buildVars,
			platform: "linux/amd64",
		},
		pathToDocker: options.pathToDocker,
		verifyDockerIsRunning: false,
	});
	await build.ready;

	options.localTags.add(localTag);
	return { localReference: localTag };
}

function createBuildOutputImageTag(options: {
	root: string;
	repositoryName: string;
	buildId: string;
}): string {
	const repositoryPrefix = getBuildOutputImageRepositoryPrefix(options.root);
	const maxNameLength = DOCKER_REPOSITORY_NAME_LENGTH - repositoryPrefix.length;
	const repositoryName = normalizeContainerImageRepositoryName(
		options.repositoryName
	)
		.slice(0, maxNameLength)
		.replace(/[._-]+$/g, "");

	return `${repositoryPrefix}${repositoryName}:${options.buildId}`;
}

async function cleanupPreviousBuildOutputImageTags(options: {
	root: string;
	pathToDocker: string;
}): Promise<void> {
	const repositoryPrefix = getBuildOutputImageRepositoryPrefix(options.root);
	let existingTags: string[];
	try {
		const output = runDockerCmdWithOutput(options.pathToDocker, [
			"image",
			"ls",
			"--filter",
			`reference=${repositoryPrefix}*`,
			"--format",
			"{{.Repository}}:{{.Tag}}",
		]);
		existingTags = output === "" ? [] : output.split(/\r?\n/);
	} catch {
		// Cleanup is best effort so registry-only builds do not require Docker.
		return;
	}

	if (existingTags.length > 0) {
		await cleanupBuiltImages(
			existingTags.map((localTag) => ({ localTag })),
			options.pathToDocker
		);
	}
}

function getBuildOutputImageRepositoryPrefix(root: string): string {
	return `${BUILD_OUTPUT_IMAGE_NAMESPACE}/${shortHash(path.resolve(root))}/`;
}

function shortHash(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function createBuildId(): string {
	return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

function countDockerfiles(
	containers: [string, ParsedInputContainerConfig][]
): number {
	let count = 0;
	for (const [, config] of containers) {
		if (config.schedulingPolicy === "durable-object") {
			count += Object.values(config.images ?? {}).filter(
				(image) => "dockerfile" in image
			).length;
		} else if ("dockerfile" in config.image) {
			count++;
		}
	}
	return count;
}

function throwBuildError(error: unknown): never {
	if (error instanceof UserError) {
		throw error;
	}
	if (error instanceof Error) {
		throw new UserError(error.message, {
			cause: error,
			telemetryMessage: "container build image operation failed",
		});
	}
	throw new UserError("An unknown error occurred", {
		telemetryMessage: "container build unknown error",
	});
}
