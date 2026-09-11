import crypto from "node:crypto";
import path from "node:path";
import { buildAndMaybePush, cleanupBuiltImages } from "./build";
import { verifyDockerInstalled } from "./utils";
import type { BuiltImage } from "./build";
import type {
	ParsedInputContainerConfig,
	ParsedOutputContainerConfig,
} from "@cloudflare/config";

/** An input Container config paired with its Build Output directory name. */
export interface NamedInputContainerConfig {
	directoryName: string;
	config: ParsedInputContainerConfig;
}

/** An output Container config paired with its Build Output directory name. */
export interface NamedOutputContainerConfig {
	directoryName: string;
	config: ParsedOutputContainerConfig;
}

/** Built Container output configs and the local image tags they reference. */
export interface BuildOutputContainerConfigsResult {
	containers: NamedOutputContainerConfig[];
	builtImages: BuiltImage[];
}

type InputContainerImage = Extract<
	ParsedInputContainerConfig,
	{ image: unknown }
>["image"];

type OutputContainerImage = Extract<
	ParsedOutputContainerConfig,
	{ image: unknown }
>["image"];

/**
 * Builds Dockerfile-backed images referenced by Build Output Container configs.
 *
 * Registry references pass through unchanged. Locally built tags are retained
 * on success so a later deploy can resolve each emitted `localReference`.
 *
 * @param options - The Container configs and Docker build environment.
 * @returns Output-schema Container configs and the local tags built for them.
 */
export async function buildOutputContainerConfigs(options: {
	containers: NamedInputContainerConfig[];
	root: string;
	pathToDocker: string;
}): Promise<BuildOutputContainerConfigsResult> {
	const dockerfileCount = countDockerfiles(options.containers);
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
	try {
		const containers: NamedOutputContainerConfig[] = [];
		for (const container of options.containers) {
			containers.push({
				directoryName: container.directoryName,
				config: await buildContainerConfig(
					container.config,
					options.root,
					options.pathToDocker,
					builtImages
				),
			});
		}
		return { containers, builtImages };
	} catch (error) {
		await cleanupBuiltImages(builtImages, options.pathToDocker);
		throw error;
	}
}

async function buildContainerConfig(
	config: ParsedInputContainerConfig,
	root: string,
	pathToDocker: string,
	builtImages: BuiltImage[]
): Promise<ParsedOutputContainerConfig> {
	if (config.schedulingPolicy === "durable-object") {
		let images: Record<string, OutputContainerImage> | undefined;
		if (config.images) {
			images = {};
			for (const [imageName, image] of Object.entries(config.images)) {
				images[imageName] = await buildContainerImage(
					image,
					sanitizeRepositoryName(`${config.name}-${imageName}`),
					root,
					pathToDocker,
					builtImages
				);
			}
		}
		return { ...config, images };
	}

	return {
		...config,
		image: await buildContainerImage(
			config.image,
			config.name.toLowerCase(),
			root,
			pathToDocker,
			builtImages
		),
	};
}

async function buildContainerImage(
	image: InputContainerImage,
	repositoryName: string,
	root: string,
	pathToDocker: string,
	builtImages: BuiltImage[]
): Promise<OutputContainerImage> {
	if ("reference" in image) {
		return { reference: image.reference };
	}

	const pathToDockerfile = path.resolve(root, image.dockerfile);
	const localTag = `${repositoryName}:wrangler-${crypto.randomUUID()}`;
	const imageRef = await buildAndMaybePush(
		{
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
		false,
		undefined,
		false
	);
	if (!("newTag" in imageRef)) {
		throw new Error("Expected a locally built Container image tag.");
	}

	builtImages.push({ localTag: imageRef.newTag });
	return { localReference: imageRef.newTag };
}

function countDockerfiles(containers: NamedInputContainerConfig[]): number {
	let count = 0;
	for (const { config } of containers) {
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

function sanitizeRepositoryName(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
