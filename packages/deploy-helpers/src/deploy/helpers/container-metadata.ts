import assert from "node:assert";
import { isDeepStrictEqual } from "node:util";
import {
	CONTAINER_IMAGES_BINDING,
	getResolvedDurableObjectContainerApps,
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
	const managedClasses = new Map(
		getResolvedDurableObjectContainerApps(
			config.containers,
			config.exports
		).map(({ name, class_name }) => [name, class_name])
	);
	const metadata =
		config.containers?.map((container) => {
			if (isDurableObjectContainerApp(container)) {
				const className = managedClasses.get(container.name);
				assert(className, "managed container class should have been resolved");
				const configuredImages = Object.keys(container.images ?? {});
				const images = preparedContainerImages[className];
				if (
					configuredImages.length > 0 &&
					images === undefined &&
					!options.allowUnprepared
				) {
					throw new Error(
						`Container images for Durable Object class "${className}" were not prepared before upload.`
					);
				}
				return {
					name: container.name,
					class_name: className,
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
}> {
	if (dryRun || !workerExists) {
		return {
			containers: getContainerMetadata(config, {}, { allowUnprepared: true }),
			hasExistingContainerImagesBinding: false,
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
	if (
		containerImagesBindingByVersion.some(
			(hasBinding) => hasBinding !== hasExistingContainerImagesBinding
		)
	) {
		throw new UserError(
			`All currently deployed Worker Versions must have identical ${CONTAINER_IMAGES_BINDING} binding presence when using --containers-rollout=none.`,
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
		};
	}

	const expectedMetadata = existingMetadata[0];
	if (
		existingMetadata.length !== containerMetadataByVersion.length ||
		existingMetadata.some(
			(metadata) => !isDeepStrictEqual(metadata, expectedMetadata)
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
	};
}
