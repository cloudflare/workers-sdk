import {
	CONTAINER_IMAGES_BINDING,
	getDurableObjectContainerApps,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../../shared/context";
import type {
	Binding,
	Config,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

type PreparedContainerImages = Record<string, Record<string, string>>;

/** Prevent keep_vars from retaining generated images when no managed Containers remain. */
export async function clearRemovedContainerImagesBindings(
	config: Config,
	bindings: Record<string, Binding>,
	workerUrl: string
): Promise<void> {
	if (getDurableObjectContainerApps(config.containers).length > 0) {
		return;
	}
	// A full upload clears Container metadata even when containers is omitted.
	// The generated bindings must follow it instead of being retained by keep_vars.
	const settings = await fetchResult<{ bindings: WorkerMetadataBinding[] }>(
		config,
		`${workerUrl}/settings`
	);
	if (settings.bindings.some(({ name }) => name === CONTAINER_IMAGES_BINDING)) {
		// An explicit empty value overrides keep_vars for the reserved image map.
		bindings[CONTAINER_IMAGES_BINDING] ??= { type: "json", value: {} };
	}
}

export function addContainerImagesBinding(
	config: Config,
	bindings: Record<string, Binding>,
	preparedContainerImages: PreparedContainerImages,
	options: {
		preserveExisting?: boolean;
		workerExists?: boolean;
		hasExistingBinding?: boolean;
	} = {}
): void {
	const containers = getDurableObjectContainerApps(config.containers);
	const shouldInheritExisting =
		options.preserveExisting &&
		options.workerExists &&
		options.hasExistingBinding;
	// Local Container edits have no effect when preserving a deployed version.
	if (options.preserveExisting && !shouldInheritExisting) {
		return;
	}
	if (containers.length === 0 && !shouldInheritExisting) {
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

	if (options.preserveExisting) {
		bindings[CONTAINER_IMAGES_BINDING] = { type: "inherit" };
		return;
	}

	bindings[CONTAINER_IMAGES_BINDING] = {
		type: "json",
		value: Object.fromEntries(
			containers.map((container) => {
				const configuredImages = Object.keys(container.images ?? {});
				const preparedImages = preparedContainerImages[container.class_name];
				if (configuredImages.length > 0 && preparedImages === undefined) {
					throw new Error(
						`Container images for Durable Object class "${container.class_name}" were not prepared before upload.`
					);
				}
				return [container.class_name, preparedImages ?? {}];
			})
		),
	};
}
