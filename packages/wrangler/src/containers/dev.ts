import assert from "node:assert";
import { createHash } from "node:crypto";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import { CONTAINER_IMAGES_BINDING, UserError } from "@cloudflare/workers-utils";
import type {
	ContainerDevConfig,
	ContainerDevOptions,
} from "@cloudflare/containers-shared";
import type { Binding } from "@cloudflare/workers-utils";

// Keep the full repository name comfortably below Docker's 255-character
// limit after adding the `cloudflare-dev/` prefix and uniqueness suffix.
const NAMED_IMAGE_SLUG_MAX_LENGTH = 200;

/** Returns the deterministic Docker tag used for one local Container image. */
export function getContainerDevImageName(
	container: Pick<ContainerDevConfig, "class_name"> & { image_name?: string },
	containerBuildId: string
): string {
	if (container.image_name === undefined) {
		return getDevContainerImageName(container.class_name, containerBuildId);
	}

	const sourceName = `${container.class_name}\0${container.image_name}`;
	const suffix = createHash("sha256")
		.update(sourceName)
		.digest("hex")
		.slice(0, 12);
	const slug = `${container.class_name}-${container.image_name}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, NAMED_IMAGE_SLUG_MAX_LENGTH)
		.replace(/-+$/g, "");
	const name = `${slug || "image"}-${suffix}`;
	return getDevContainerImageName(name, containerBuildId);
}

/** Converts normalized Container config into build/pull options for Docker. */
export function getContainerDevOptions(
	containersConfig: ContainerDevConfig[],
	containerBuildId: string
): ContainerDevOptions[] {
	const containers: ContainerDevOptions[] = [];
	for (const container of containersConfig) {
		if (!("image_uri" in container) && !("dockerfile" in container)) {
			continue;
		}
		const imageTag = getContainerDevImageName(container, containerBuildId);
		const imageName =
			"image_name" in container ? container.image_name : undefined;
		if ("image_uri" in container) {
			containers.push({
				image_uri: container.image_uri,
				class_name: container.class_name,
				image_name: imageName,
				image_tag: imageTag,
			});
		} else {
			containers.push({
				dockerfile: container.dockerfile,
				image_build_context: container.image_build_context,
				image_vars: container.image_vars,
				class_name: container.class_name,
				image_name: imageName,
				image_tag: imageTag,
			});
		}
	}
	return containers;
}

/**
 * Selects a real local fallback image for each Durable Object-managed
 * Container. Workerd uses this attachment when restoring a container snapshot
 * without an explicit image, while ordinary starts can still override it with
 * any named image from the injected image map.
 */
export function getDurableObjectContainerDefaultImageNames(
	containersConfig: ContainerDevConfig[] | undefined,
	containerBuildId: string | undefined
): Map<string, string> {
	const defaults = new Map<string, string>();
	if (!containersConfig || !containerBuildId) {
		return defaults;
	}

	for (const container of containersConfig) {
		if (
			container.scheduling_policy !== "durable_object" ||
			defaults.has(container.class_name) ||
			(!("image_uri" in container) && !("dockerfile" in container))
		) {
			continue;
		}
		defaults.set(
			container.class_name,
			getContainerDevImageName(container, containerBuildId)
		);
	}

	return defaults;
}

/**
 * Exposes local Docker tags through the same reserved binding used in
 * production, allowing `ctx.container.images` and the environment binding to
 * select named images without special application code.
 */
export function addDurableObjectContainerImagesBinding(
	bindings: Record<string, Binding>,
	containers: ContainerDevConfig[] | undefined,
	containerBuildId: string | undefined
): void {
	const dynamicContainers = containers?.filter(
		(container) => container.scheduling_policy === "durable_object"
	);
	if (!dynamicContainers?.length) {
		return;
	}
	if (bindings[CONTAINER_IMAGES_BINDING] !== undefined) {
		throw new UserError(
			`The binding name "${CONTAINER_IMAGES_BINDING}" is reserved for Durable Object-managed Container images.`,
			{
				telemetryMessage:
					"durable object container images binding name conflict",
			}
		);
	}
	assert(
		containerBuildId,
		"Build ID should be set if containers are defined and enabled"
	);

	const images: Record<string, Record<string, string>> = {};
	for (const container of dynamicContainers) {
		const classImages = (images[container.class_name] ??= {});
		if ("image_name" in container) {
			classImages[container.image_name] = getContainerDevImageName(
				container,
				containerBuildId
			);
		}
	}
	bindings[CONTAINER_IMAGES_BINDING] = { type: "json", value: images };
}
