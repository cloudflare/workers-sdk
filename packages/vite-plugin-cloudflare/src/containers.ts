import {
	configureOpenAPIForContainerPull,
	isCloudflareRegistryImage,
	prepareContainerImagesForDev,
	resolveImageName,
} from "@cloudflare/containers-shared";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getCloudflareApiBaseUrl,
	UserError,
} from "@cloudflare/workers-utils";
import { toApiComplianceRegion } from "./utils";
import type { ParsedInputSettingsConfig } from "@cloudflare/config";
import type {
	ContainerDevOptions,
	ViteLogger,
} from "@cloudflare/containers-shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Configures the Containers API client used to retrieve image pull credentials.
 *
 * @param accountId - Cloudflare account ID that owns the managed registry.
 * @param apiToken - API token used to request registry credentials.
 * @param complianceConfig - Compliance configuration used to select the API endpoint.
 * @returns No value.
 */
export function configureContainerPull(
	accountId: string,
	apiToken: string,
	complianceConfig?: ComplianceConfig
): void {
	configureOpenAPIForContainerPull(
		accountId,
		apiToken,
		getCloudflareApiBaseUrl(
			complianceConfig ?? COMPLIANCE_REGION_CONFIG_UNKNOWN
		)
	);
}

/**
 * Qualifies managed-registry image references with the selected Cloudflare
 * account before Docker pulls them.
 *
 * @param options - Planned images and registry settings.
 * @returns Container options with managed-registry image references qualified.
 */
export function normalizeContainerImageUris(options: {
	containerOptions: readonly ContainerDevOptions[];
	accountId: string;
	complianceConfig?: ComplianceConfig;
}): ContainerDevOptions[] {
	return options.containerOptions.map((containerOption) =>
		"image_uri" in containerOption &&
		isCloudflareRegistryImage(
			containerOption.image_uri,
			options.complianceConfig
		)
			? {
					...containerOption,
					image_uri: resolveImageName(
						options.accountId,
						containerOption.image_uri,
						options.complianceConfig
					),
				}
			: containerOption
	);
}

/**
 * Builds or pulls the images in a v2 Container development plan.
 *
 * @param options - Planned images, project settings, Docker executable, and Vite logger.
 * @returns A promise that resolves when every image is ready.
 */
export async function prepareContainerImagesForVite(options: {
	dockerPath: string;
	containerOptions: ContainerDevOptions[];
	settings: ParsedInputSettingsConfig;
	logger: ViteLogger;
}): Promise<void> {
	const complianceRegion = toApiComplianceRegion(
		options.settings.complianceRegion
	);
	const complianceConfig =
		complianceRegion === undefined
			? undefined
			: { compliance_region: complianceRegion };
	let containerOptions = options.containerOptions;
	const hasCloudflareRegistryImages = containerOptions.some(
		(containerOption) =>
			"image_uri" in containerOption &&
			isCloudflareRegistryImage(containerOption.image_uri, complianceConfig)
	);

	if (hasCloudflareRegistryImages) {
		const apiToken = process.env.CLOUDFLARE_API_TOKEN;
		const accountId =
			options.settings.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;

		if (!apiToken || !accountId) {
			throw new UserError(
				"To use images from the Cloudflare-managed registry with the Vite plugin, " +
					"set the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables.\n" +
					"The API token requires Containers:Edit and Workers Scripts:Edit permissions.\n" +
					"Alternatively, use a Dockerfile that references the image via FROM.",
				{ telemetryMessage: false }
			);
		}

		configureContainerPull(accountId, apiToken, complianceConfig);
		containerOptions = normalizeContainerImageUris({
			containerOptions,
			accountId,
			complianceConfig,
		});
	}

	await prepareContainerImagesForDev({
		dockerPath: options.dockerPath,
		containerOptions,
		onContainerImagePreparationStart: () => {},
		onContainerImagePreparationEnd: () => {},
		logger: options.logger,
		complianceConfig,
	});
}
