import path from "node:path";
import {
	getContainersDir,
	writeContainerConfig,
} from "@cloudflare/build-output-utils";
import { removeDir } from "@cloudflare/workers-utils";
import { UserError } from "@cloudflare/workers-utils/errors";
import {
	cleanupBuiltImages,
	createLocalContainerImageTag,
	startContainerBuild,
} from "./build";
import { verifyDockerInstalled } from "./utils";
import type { BuiltImage } from "./build";
import type { WriteContainerConfigOptions } from "@cloudflare/build-output-utils";
import type {
	ParsedInputContainerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";

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

	const builtImages: BuiltImage[] = [];
	let outputConfigs: WriteContainerConfigOptions[];
	try {
		outputConfigs = [];
		for (const [directoryName, config] of containers) {
			let outputConfig: ParsedOutputContainerConfig;
			if (config.schedulingPolicy === "durable-object") {
				const images: NonNullable<
					Extract<
						ParsedOutputContainerConfig,
						{ schedulingPolicy: "durable-object" }
					>["images"]
				> = {};
				for (const [imageName, image] of Object.entries(config.images ?? {})) {
					images[imageName] = await buildContainerImage(
						image,
						`${config.name}-${imageName}`,
						options.root,
						options.pathToDocker,
						builtImages
					);
				}
				outputConfig = {
					...config,
					images: config.images === undefined ? undefined : images,
				};
			} else {
				outputConfig = {
					...config,
					image: await buildContainerImage(
						config.image,
						config.name,
						options.root,
						options.pathToDocker,
						builtImages
					),
				};
			}

			outputConfigs.push({
				root: options.root,
				directoryName,
				config: outputConfig,
			});
		}
	} catch (error) {
		await cleanupBuiltImages(builtImages, options.pathToDocker);
		throwBuildError(error);
	}

	try {
		for (const outputConfig of outputConfigs) {
			await writeContainerConfig(outputConfig);
		}
	} catch (error) {
		await Promise.all([
			removeDir(getContainersDir(options.root)),
			cleanupBuiltImages(builtImages, options.pathToDocker),
		]);
		throw error;
	}
}
async function buildContainerImage(
	image: Extract<ParsedInputContainerConfig, { image: unknown }>["image"],
	repositoryName: string,
	root: string,
	pathToDocker: string,
	builtImages: BuiltImage[]
): Promise<Extract<ParsedOutputContainerConfig, { image: unknown }>["image"]> {
	if ("reference" in image) {
		return { reference: image.reference };
	}

	const pathToDockerfile = path.resolve(root, image.dockerfile);
	const localTag = createLocalContainerImageTag(repositoryName);
	const build = await startContainerBuild({
		build: {
			tag: localTag,
			pathToDockerfile,
			buildContext:
				image.buildContext === undefined
					? path.dirname(pathToDockerfile)
					: path.resolve(root, image.buildContext),
			args: image.buildVars,
			platform: "linux/amd64",
		},
		pathToDocker,
		verifyDockerIsRunning: false,
	});
	await build.ready;

	builtImages.push({ localTag });
	return { localReference: localTag };
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
