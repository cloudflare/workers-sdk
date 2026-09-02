import {
	CONTAINER_IMAGES_BINDING,
	isDurableObjectContainerApp,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchListResult } from "../../shared/context";
import { fetchVersions } from "./versions-api";
import type { ApiDeployment } from "./versions-types";
import type {
	CfWorkerInit,
	Config,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

type ContainerImages = Record<string, Record<string, string>>;

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
}

function parseContainerImagesBinding(
	bindings: WorkerMetadataBinding[]
): ContainerImages {
	const binding = bindings.find(
		(candidate) => candidate.name === CONTAINER_IMAGES_BINDING
	);
	if (binding === undefined) {
		return {};
	}
	if (binding.type !== "json") {
		throw new UserError(
			`The existing ${CONTAINER_IMAGES_BINDING} binding has an invalid type.`,
			{
				telemetryMessage:
					"rollout none invalid durable object container image binding type",
			}
		);
	}

	let value: unknown = binding.json;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			throw new UserError(
				`The existing ${CONTAINER_IMAGES_BINDING} binding contains invalid JSON.`,
				{
					telemetryMessage:
						"rollout none invalid durable object container image binding json",
				}
			);
		}
	}
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		!Object.values(value).every(isStringRecord)
	) {
		throw new UserError(
			`The existing ${CONTAINER_IMAGES_BINDING} binding has an invalid image map.`,
			{
				telemetryMessage:
					"rollout none invalid durable object container image binding map",
			}
		);
	}

	return value as ContainerImages;
}

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
	}: {
		accountId: string | undefined;
		scriptName: string;
		dispatchNamespace: string | undefined;
		workerExists: boolean;
		latestDeployment: ApiDeployment | undefined;
	}
): Promise<{
	containers: CfWorkerInit["containers"];
	hasExistingContainerImagesBinding: boolean;
}> {
	const configuredMetadata = getContainerMetadata(
		config,
		{},
		{
			allowUnprepared: true,
		}
	);
	if (
		config.containers === undefined ||
		!workerExists ||
		accountId === undefined
	) {
		return {
			containers: configuredMetadata,
			hasExistingContainerImagesBinding: false,
		};
	}

	if (dispatchNamespace !== undefined) {
		const bindings = await fetchListResult<WorkerMetadataBinding>(
			config,
			`/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/bindings`
		);
		return {
			containers: getContainerMetadata(
				config,
				parseContainerImagesBinding(bindings),
				{
					allowUnprepared: true,
				}
			),
			hasExistingContainerImagesBinding: bindings.some(
				(binding) => binding.name === CONTAINER_IMAGES_BINDING
			),
		};
	}

	if (
		latestDeployment === undefined ||
		latestDeployment.versions.length === 0
	) {
		return {
			containers: configuredMetadata,
			hasExistingContainerImagesBinding: false,
		};
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
			containers: configuredMetadata,
			hasExistingContainerImagesBinding,
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
	};
}
