import { createHash } from "node:crypto";
import path from "node:path";
import {
	getResolvedDurableObjectContainerApps,
	isDockerfile,
	isDurableObjectContainerApp,
	resolveContainerClassName,
} from "@cloudflare/workers-utils";
import { resolveInputContainerImage } from "./input-container-image";
import { getDevContainerImageName } from "./knobs";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import type {
	ContainerDevOptions,
	ContainerDevPlan,
	ContainerDevRuntimeOptions,
} from "./types";
import type {
	ParsedInputContainerConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";
import type { Config } from "@cloudflare/workers-utils";

type CreateContainerDevPlanOptions = {
	containers: Config["containers"];
	exports: Config["exports"];
	configPath?: string;
	containerBuildId?: string;
};

type NamedContainerDevOptions = ContainerDevOptions & { image_name: string };

type ContainerPlanExports =
	| ParsedInputWorkerConfig["exports"]
	| ParsedOutputWorkerConfig["exports"];

type ContainerPlanDefinition<TImage> =
	| {
			name: string;
			schedulingPolicy: "durable-object";
			images?: Record<string, TImage>;
	  }
	| {
			name: string;
			schedulingPolicy?: "default" | "regional";
			image: TImage;
	  };

type ContainerImagePlan = {
	reference: string;
	containerOption?: ContainerDevOptions;
};

const MAX_DOCKER_REPOSITORY_NAME_LENGTH = 255;
const MAX_NAMED_IMAGE_SLUG_LENGTH =
	MAX_DOCKER_REPOSITORY_NAME_LENGTH - MF_DEV_CONTAINER_PREFIX.length - 1;
const IMAGE_ID_HASH_LENGTH = 12;

/** Returns the deterministic Docker tag used for one local named image. */
function getNamedContainerImageTag(
	className: string,
	imageName: string,
	containerBuildId: string
): string {
	const identity = `${className}\0${imageName}`;
	const classSlug = getDockerRepositorySlug(className);
	const imageSlug = getDockerRepositorySlug(imageName);
	const identityHash = createHash("sha256")
		.update(identity)
		.digest("hex")
		.slice(0, IMAGE_ID_HASH_LENGTH);
	const readableSlug = `${classSlug || "container"}-${imageSlug || "image"}`;
	const prefix = readableSlug
		.slice(0, MAX_NAMED_IMAGE_SLUG_LENGTH - identityHash.length - 1)
		.replace(/-+$/g, "");
	return getDevContainerImageName(
		`${prefix}-${identityHash}`,
		containerBuildId
	);
}

function getDockerRepositorySlug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function requireContainerBuildId(containerBuildId: string | undefined): string {
	if (containerBuildId === undefined) {
		throw new Error(
			"Build ID should be set when a Container image requires preparation"
		);
	}
	return containerBuildId;
}

/**
 * Builds the local image and runtime plan for a Worker's Container
 * configuration, shared by Wrangler and the Vite plugin.
 *
 * @param options - Worker container configuration and optional generated build ID.
 * @returns Local container plan, or `undefined` when no Container runtime or
 * image preparation is needed.
 * @throws If image preparation is required without a build ID.
 */
export function createContainerDevPlan(
	options: CreateContainerDevPlanOptions
): ContainerDevPlan | undefined {
	const { containers, exports, containerBuildId, configPath } = options;

	if (!containers?.length) {
		return undefined;
	}

	const containerOptions: ContainerDevOptions[] = [];
	const containerRuntimeOptions = new Map<string, ContainerDevRuntimeOptions>();
	const durableObjectContainerAppsByName = new Map(
		getResolvedDurableObjectContainerApps(containers, exports).map(
			(container) => [container.name, container] as const
		)
	);

	for (const container of containers) {
		if (isDurableObjectContainerApp(container)) {
			const resolvedContainer = durableObjectContainerAppsByName.get(
				container.name
			);
			if (resolvedContainer === undefined) {
				throw new Error(
					`Expected Durable Object-managed Container "${container.name}" to be resolved`
				);
			}
			const className = resolvedContainer.class_name;
			const namedOptions: NamedContainerDevOptions[] = [];
			const baseDir = configPath ? path.dirname(configPath) : process.cwd();
			for (const [imageName, image] of Object.entries(container.images ?? {})) {
				const imageTag = getNamedContainerImageTag(
					className,
					imageName,
					requireContainerBuildId(containerBuildId)
				);
				if (image.dockerfile !== undefined) {
					const dockerfile = path.resolve(baseDir, image.dockerfile);
					namedOptions.push({
						dockerfile,
						image_build_context:
							image.build_context === undefined
								? path.dirname(dockerfile)
								: path.resolve(baseDir, image.build_context),
						image_vars: image.build_vars,
						class_name: className,
						image_name: imageName,
						image_tag: imageTag,
					});
				} else {
					namedOptions.push({
						image_uri: image.image,
						class_name: className,
						image_name: imageName,
						image_tag: imageTag,
					});
				}
			}

			containerOptions.push(...namedOptions);
			const images = namedOptions.map(({ image_name, image_tag }) => ({
				name: image_name,
				image: image_tag,
			}));
			containerRuntimeOptions.set(
				className,
				images.length === 0 ? {} : { images }
			);
			continue;
		}

		if (container.image === undefined) {
			continue;
		}

		const className = resolveContainerClassName(container, exports);
		if (className === undefined) {
			continue;
		}

		const imageTag = getDevContainerImageName(
			className,
			requireContainerBuildId(containerBuildId)
		);
		containerRuntimeOptions.set(className, { imageName: imageTag });
		if (isDockerfile(container.image, configPath)) {
			containerOptions.push({
				dockerfile: container.image,
				image_build_context:
					container.image_build_context ?? path.dirname(container.image),
				image_vars: container.image_vars,
				class_name: className,
				image_tag: imageTag,
			});
		} else {
			containerOptions.push({
				image_uri: container.image,
				class_name: className,
				image_tag: imageTag,
			});
		}
	}

	return containerOptions.length === 0 && containerRuntimeOptions.size === 0
		? undefined
		: { containerOptions, containerRuntimeOptions };
}

/**
 * Builds the local image and runtime plan directly from parsed
 * `cloudflare.config.ts` Container configuration.
 *
 * @param options - Input Container definitions, Worker exports, project root, and build ID.
 * @returns The image preparation and runtime plan, or `undefined` when no export links a Container.
 * @throws If a linked Container is missing or image preparation has no build ID.
 */
export function createV2ContainerDevPlan(options: {
	containers: ParsedInputContainerConfig[];
	exports: ParsedInputWorkerConfig["exports"];
	root: string;
	containerBuildId?: string;
}): ContainerDevPlan | undefined {
	return createV2ContainerPlan({
		containers: options.containers,
		exports: options.exports,
		containerDescription: "Container",
		createImagePlan: ({ image, className, imageName }) => {
			const buildId = requireContainerBuildId(options.containerBuildId);
			const imageTag =
				imageName === undefined
					? getDevContainerImageName(className, buildId)
					: getNamedContainerImageTag(className, imageName, buildId);
			const resolvedImage = resolveInputContainerImage({
				image,
				root: options.root,
			});
			const containerOptionBase = {
				class_name: className,
				image_tag: imageTag,
				...(imageName === undefined ? {} : { image_name: imageName }),
			};
			return {
				reference: imageTag,
				containerOption:
					"reference" in resolvedImage
						? {
								...containerOptionBase,
								image_uri: resolvedImage.reference,
							}
						: {
								...containerOptionBase,
								dockerfile: resolvedImage.dockerfile,
								image_build_context: resolvedImage.buildContext,
								image_vars: resolvedImage.buildVars,
							},
			};
		},
	});
}

/**
 * Builds Container runtime metadata directly from Build Output references.
 * Local references need no preparation; remote references also produce a
 * pull-only preparation option without generating a replacement tag.
 *
 * @param options - Parsed Container and Worker Build Output configuration.
 * @returns Runtime metadata keyed by Durable Object export, or `undefined` when none use Containers.
 * @throws If Build Output omits a Container referenced by a Worker export.
 */
export function createV2ContainerPreviewPlan(options: {
	containers: ParsedOutputContainerConfig[];
	exports: ParsedOutputWorkerConfig["exports"];
}): ContainerDevPlan | undefined {
	return createV2ContainerPlan({
		containers: options.containers,
		exports: options.exports,
		containerDescription: "Build Output Container",
		createImagePlan: ({ image, className, imageName }) => {
			const reference =
				"reference" in image ? image.reference : image.localReference;
			if (!("reference" in image)) {
				return { reference };
			}

			return {
				reference,
				containerOption: {
					image_uri: reference,
					image_tag: reference,
					class_name: className,
					...(imageName === undefined ? {} : { image_name: imageName }),
				},
			};
		},
	});
}

function createV2ContainerPlan<TImage>(options: {
	containers: ContainerPlanDefinition<TImage>[];
	exports: ContainerPlanExports;
	containerDescription: string;
	createImagePlan: (options: {
		image: TImage;
		className: string;
		imageName?: string;
	}) => ContainerImagePlan;
}): ContainerDevPlan | undefined {
	const containersByName = indexContainersByName(options.containers);
	const containerOptions: ContainerDevOptions[] = [];
	const containerRuntimeOptions = new Map<string, ContainerDevRuntimeOptions>();

	for (const [className, containerName] of getContainerLinks(options.exports)) {
		const container = containersByName.get(containerName);
		if (container === undefined) {
			throw new Error(
				`Expected ${options.containerDescription} "${containerName}" referenced by Durable Object export "${className}" to be defined`
			);
		}

		if (container.schedulingPolicy === "durable-object") {
			const images = Object.entries(container.images ?? {}).map(
				([name, image]) => {
					const imagePlan = options.createImagePlan({
						image,
						className,
						imageName: name,
					});
					if (imagePlan.containerOption !== undefined) {
						containerOptions.push(imagePlan.containerOption);
					}
					return { name, image: imagePlan.reference };
				}
			);
			containerRuntimeOptions.set(
				className,
				images.length === 0 ? {} : { images }
			);
			continue;
		}

		const imagePlan = options.createImagePlan({
			image: container.image,
			className,
		});
		if (imagePlan.containerOption !== undefined) {
			containerOptions.push(imagePlan.containerOption);
		}
		containerRuntimeOptions.set(className, { imageName: imagePlan.reference });
	}

	return containerRuntimeOptions.size === 0
		? undefined
		: { containerOptions, containerRuntimeOptions };
}

function getContainerLinks(
	exports: ContainerPlanExports
): Array<[className: string, containerName: string]> {
	const links: Array<[className: string, containerName: string]> = [];
	for (const [className, workerExport] of Object.entries(exports ?? {})) {
		if (
			workerExport.type !== "durable-object" ||
			!("container" in workerExport) ||
			workerExport.container === undefined
		) {
			continue;
		}
		links.push([className, workerExport.container]);
	}
	return links;
}

function indexContainersByName<T extends { name: string }>(
	containers: T[]
): Map<string, T> {
	const containersByName = new Map<string, T>();
	for (const container of containers) {
		if (containersByName.has(container.name)) {
			throw new Error(`Duplicate Container name "${container.name}"`);
		}
		containersByName.set(container.name, container);
	}
	return containersByName;
}
