import { createHash } from "node:crypto";
import path from "node:path";
import {
	isDockerfile,
	isDurableObjectContainerApp,
	resolveContainerClassName,
} from "@cloudflare/workers-utils";
import { getDevContainerImageName } from "./knobs";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import type {
	ContainerDevOptions,
	ContainerDevPlan,
	ContainerDevRuntimeOptions,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";

type ContainerDevPlanSourceOptions = {
	containers: Config["containers"];
	exports: Config["exports"];
	configPath?: string;
};

type CreateContainerDevPlanOptions = ContainerDevPlanSourceOptions & {
	containerBuildId?: string;
};

type NamedContainerDevOptions = ContainerDevOptions & { image_name: string };

const MAX_DOCKER_REPOSITORY_NAME_LENGTH = 255;
const MAX_NAMED_IMAGE_SLUG_LENGTH =
	MAX_DOCKER_REPOSITORY_NAME_LENGTH - MF_DEV_CONTAINER_PREFIX.length - 1;
const TRUNCATED_IMAGE_TAG_HASH_LENGTH = 12;

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
		.slice(0, TRUNCATED_IMAGE_TAG_HASH_LENGTH);
	const slug =
		imageSlug === ""
			? `${classSlug || "image"}-${identityHash}`
			: [classSlug, imageSlug].filter(Boolean).join("-");
	if (slug.length <= MAX_NAMED_IMAGE_SLUG_LENGTH) {
		return getDevContainerImageName(slug, containerBuildId);
	}

	const prefix = slug
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

function compareImageNames(
	[left]: [string, unknown],
	[right]: [string, unknown]
): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function registerImageTag(
	imageTagOwners: Map<string, string>,
	imageTag: string,
	owner: string
): void {
	const existingOwner = imageTagOwners.get(imageTag);
	if (existingOwner !== undefined) {
		throw new Error(
			`Local Container images "${existingOwner}" and "${owner}" resolve to the same Docker tag.`
		);
	}
	imageTagOwners.set(imageTag, owner);
}

/**
 * Converts Worker container configuration into one local image and
 * runtime plan shared by Wrangler and Vite.
 *
 * @param options - Worker container configuration and optional generated build ID.
 * @returns Local container plan, or `undefined` when no Container runtime or
 * image preparation is needed.
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
	const imageTagOwners = new Map<string, string>();

	for (const container of containers) {
		if (isDurableObjectContainerApp(container)) {
			const namedOptions: NamedContainerDevOptions[] = [];
			const baseDir = configPath ? path.dirname(configPath) : process.cwd();
			for (const [imageName, image] of Object.entries(
				container.images ?? {}
			).sort(compareImageNames)) {
				const imageTag = getNamedContainerImageTag(
					container.class_name,
					imageName,
					requireContainerBuildId(containerBuildId)
				);
				const owner = `${container.class_name}.${imageName}`;
				registerImageTag(imageTagOwners, imageTag, owner);

				if (image.dockerfile !== undefined) {
					const dockerfile = path.resolve(baseDir, image.dockerfile);
					namedOptions.push({
						dockerfile,
						image_build_context: path.dirname(dockerfile),
						class_name: container.class_name,
						image_name: imageName,
						image_tag: imageTag,
					});
				} else {
					namedOptions.push({
						image_uri: image.image,
						class_name: container.class_name,
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
				container.class_name,
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
		const owner = className;
		registerImageTag(imageTagOwners, imageTag, owner);
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
