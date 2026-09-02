import {
	CONTAINER_IMAGES_BINDING,
	hasContainerImagesMetadata,
	isDurableObjectContainerApp,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchVersions } from "./versions-api";
import type { ApiDeployment } from "./versions-types";
import type { CfWorkerInit, Config } from "@cloudflare/workers-utils";

type ContainerImages = Record<string, Record<string, string>>;

export function getContainerMetadata(
	config: Config,
	preparedContainerImages: ContainerImages = {},
	options: { allowUnprepared?: boolean } = {}
): CfWorkerInit["containers"] {
	const metadata =
		config.containers?.map((container) => {
			if (isDurableObjectContainerApp(container)) {
				const configuredImages = Object.keys(container.images ?? {});
				const images = preparedContainerImages[container.class_name];
				if (
					configuredImages.length > 0 &&
					images === undefined &&
					!options.allowUnprepared
				) {
					throw new Error(
						`Container images for Durable Object class "${container.class_name}" were not prepared before upload.`
					);
				}
				return {
					name: container.name,
					class_name: container.class_name,
					...(images !== undefined && { images }),
				};
			}

			return {
				...(container.name !== undefined && { name: container.name }),
				...(container.class_name !== undefined && {
					class_name: container.class_name,
				}),
			};
		}) ?? [];

	return config.containers === undefined ? undefined : metadata;
}

export async function getContainerMetadataForRolloutSkip(
	config: Config,
	{
		accountId,
		scriptName,
		dispatchNamespace,
		workerExists,
		latestDeployment,
		dryRun = false,
	}: {
		accountId: string | undefined;
		scriptName: string;
		dispatchNamespace: string | undefined;
		workerExists: boolean;
		latestDeployment: ApiDeployment | undefined;
		dryRun?: boolean;
	}
): Promise<{
	containers: CfWorkerInit["containers"];
	hasExistingContainerImagesBinding: boolean;
	hasExistingContainerImagesMetadata: boolean;
}> {
	const configuredMetadata = getContainerMetadata(
		config,
		{},
		{
			allowUnprepared: true,
		}
	);
	if (dryRun || !workerExists) {
		return {
			containers: configuredMetadata,
			hasExistingContainerImagesBinding: false,
			hasExistingContainerImagesMetadata: false,
		};
	}

	if (dispatchNamespace !== undefined) {
		// Dispatch script settings expose bindings, but not Container metadata.
		// Rebuilding from local config loses deployed names and scheduler links;
		// omitting containers from a full upload can also clear those links.
		throw new UserError(
			"Cannot use --containers-rollout=none for an existing dispatch script because the Workers for Platforms API does not expose its deployed Container metadata. The Worker has not been uploaded. Deploy without this flag only when you intend to apply the local Container configuration.",
			{
				telemetryMessage:
					"rollout none dispatch container metadata unavailable",
			}
		);
	}

	if (
		accountId === undefined ||
		latestDeployment === undefined ||
		latestDeployment.versions.length === 0
	) {
		throw new UserError(
			"Cannot use --containers-rollout=none for an existing Worker because its deployed Container metadata could not be recovered. The Worker has not been uploaded. Deploy without this flag only when you intend to apply the local Container configuration.",
			{
				telemetryMessage:
					"rollout none deployed container metadata unavailable",
			}
		);
	}

	const versions = await fetchVersions(
		config,
		accountId,
		scriptName,
		undefined,
		latestDeployment.versions.map(({ version_id }) => version_id)
	);
	const containerImagesBindingByVersion = versions.map((version) =>
		version.resources.bindings.some(
			(binding) => binding.name === CONTAINER_IMAGES_BINDING
		)
	);
	const hasExistingContainerImagesBinding =
		containerImagesBindingByVersion[0] ?? false;
	const containerImagesMetadataByVersion = versions.map((version) =>
		hasContainerImagesMetadata(version.resources.bindings)
	);
	const hasExistingContainerImagesMetadata =
		containerImagesMetadataByVersion[0] ?? false;
	if (
		containerImagesBindingByVersion.some(
			(hasBinding) => hasBinding !== hasExistingContainerImagesBinding
		) ||
		containerImagesMetadataByVersion.some(
			(hasMetadata) => hasMetadata !== hasExistingContainerImagesMetadata
		) ||
		(hasExistingContainerImagesMetadata && !hasExistingContainerImagesBinding)
	) {
		throw new UserError(
			`All currently deployed Worker Versions must have identical ${CONTAINER_IMAGES_BINDING} binding presence and matching Container images metadata markers when using --containers-rollout=none.`,
			{
				telemetryMessage:
					"rollout none inconsistent durable object container image binding",
			}
		);
	}
	const containerMetadataByVersion = versions.map(
		(version) => version.resources?.script_runtime?.containers
	);
	const existingMetadata = containerMetadataByVersion.filter(
		(metadata): metadata is NonNullable<CfWorkerInit["containers"]> =>
			metadata !== undefined
	);
	if (existingMetadata.length === 0) {
		return {
			containers: undefined,
			hasExistingContainerImagesBinding,
			hasExistingContainerImagesMetadata,
		};
	}

	const expectedMetadata = JSON.stringify(existingMetadata[0]);
	if (
		existingMetadata.length !== containerMetadataByVersion.length ||
		existingMetadata.some(
			(metadata) => JSON.stringify(metadata) !== expectedMetadata
		)
	) {
		throw new UserError(
			"All currently deployed Worker Versions must have identical Container metadata when using --containers-rollout=none.",
			{
				telemetryMessage:
					"rollout none inconsistent deployed container metadata",
			}
		);
	}

	return {
		containers: existingMetadata[0],
		hasExistingContainerImagesBinding,
		hasExistingContainerImagesMetadata,
	};
}
