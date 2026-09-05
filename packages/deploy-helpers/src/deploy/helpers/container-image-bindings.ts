import {
	CONTAINER_IMAGES_BINDING,
	CONTAINER_IMAGES_METADATA_BINDING,
	CONTAINER_IMAGES_METADATA_VERSION,
	getDurableObjectContainerApps,
	UserError,
} from "@cloudflare/workers-utils";
import type { Binding, Config } from "@cloudflare/workers-utils";

type PreparedContainerImages = Record<string, Record<string, string>>;

export function addContainerImagesBinding(
	config: Config,
	bindings: Record<string, Binding>,
	preparedContainerImages: PreparedContainerImages,
	options: {
		preserveExisting?: boolean;
		workerExists?: boolean;
		hasExistingBinding?: boolean;
		hasExistingMetadata?: boolean;
	} = {}
): void {
	const containers = getDurableObjectContainerApps(config.containers);
	const shouldInheritExisting =
		options.preserveExisting &&
		options.workerExists &&
		options.hasExistingBinding;
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
	if (
		(!options.preserveExisting || options.hasExistingMetadata) &&
		bindings[CONTAINER_IMAGES_METADATA_BINDING] !== undefined
	) {
		throw new UserError(
			`The binding name "${CONTAINER_IMAGES_METADATA_BINDING}" is reserved for Durable Object-managed Container metadata.`,
			{
				telemetryMessage:
					"durable object container metadata binding name conflict",
			}
		);
	}

	if (options.preserveExisting) {
		if (shouldInheritExisting) {
			bindings[CONTAINER_IMAGES_BINDING] = { type: "inherit" };
			if (options.hasExistingMetadata) {
				bindings[CONTAINER_IMAGES_METADATA_BINDING] = { type: "inherit" };
			}
		}
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
	// This marker survives version uploads and inheritance, including empty image
	// maps that the Containers API omits when serializing its metadata.
	bindings[CONTAINER_IMAGES_METADATA_BINDING] = {
		type: "json",
		value: CONTAINER_IMAGES_METADATA_VERSION,
	};
}
