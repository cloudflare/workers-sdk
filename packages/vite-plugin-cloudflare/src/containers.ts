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
import type {
	ContainerDevOptions,
	ViteLogger,
} from "@cloudflare/containers-shared";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

type ContainerWorkerConfig = ComplianceConfig & { account_id?: string };

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
 * @param containerOptions - Planned Container images.
 * @param accountId - Cloudflare account ID that owns managed-registry images.
 * @param complianceConfig - Compliance configuration used to select the managed registry.
 * @returns Container options with managed-registry image references qualified.
 */
export function normalizeContainerImageUris(
	containerOptions: readonly ContainerDevOptions[],
	accountId: string,
	complianceConfig?: ComplianceConfig
): ContainerDevOptions[] {
	return containerOptions.map((option) =>
		"image_uri" in option &&
		isCloudflareRegistryImage(option.image_uri, complianceConfig)
			? {
					...option,
					image_uri: resolveImageName(
						accountId,
						option.image_uri,
						complianceConfig
					),
				}
			: option
	);
}

/**
 * Prepares each Worker's Container images with that Worker's registry account
 * and compliance settings.
 *
 * @param args - Planned images, Docker executable, and Vite logger.
 * @returns No value.
 */
export async function prepareContainerImagesForVite(args: {
	dockerPath: string;
	containerTagToOptionsMap: ContainerTagToOptionsMap;
	logger: ViteLogger;
}): Promise<void> {
	const optionsByWorkerConfig = new Map<
		ContainerWorkerConfig,
		ContainerDevOptions[]
	>();
	for (const {
		containerOptions,
		workerConfig,
	} of args.containerTagToOptionsMap.values()) {
		const options = optionsByWorkerConfig.get(workerConfig) ?? [];
		options.push(containerOptions);
		optionsByWorkerConfig.set(workerConfig, options);
	}

	for (const [workerConfig, plannedOptions] of optionsByWorkerConfig) {
		let containerOptions = plannedOptions;
		const hasCloudflareRegistryImages = containerOptions.some(
			(options) =>
				"image_uri" in options &&
				isCloudflareRegistryImage(options.image_uri, workerConfig)
		);

		if (hasCloudflareRegistryImages) {
			const apiToken = process.env.CLOUDFLARE_API_TOKEN;
			const accountId =
				workerConfig.account_id ?? process.env.CLOUDFLARE_ACCOUNT_ID;

			if (!apiToken || !accountId) {
				throw new UserError(
					"To use images from the Cloudflare-managed registry with the Vite plugin, " +
						"set the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables.\n" +
						"The API token requires Containers:Edit and Workers Scripts:Edit permissions.\n" +
						"Alternatively, use a Dockerfile that references the image via FROM.",
					{ telemetryMessage: false }
				);
			}

			configureContainerPull(accountId, apiToken, workerConfig);
			containerOptions = normalizeContainerImageUris(
				containerOptions,
				accountId,
				workerConfig
			);
		}

		await prepareContainerImagesForDev({
			dockerPath: args.dockerPath,
			containerOptions,
			onContainerImagePreparationStart: () => {},
			onContainerImagePreparationEnd: () => {},
			logger: args.logger,
			complianceConfig: workerConfig,
		});
	}
}

/**
 * Returns the path to the Docker executable as defined by the
 * `WRANGLER_DOCKER_BIN` environment variable, or the default value
 * `"docker"`
 */
export function getDockerPath(): string {
	const defaultDockerPath = "docker";
	const dockerPathEnvVar = "WRANGLER_DOCKER_BIN";

	return process.env[dockerPathEnvVar] || defaultDockerPath;
}

export type ContainerTagToOptionsMap = Map<
	string,
	{
		containerOptions: ContainerDevOptions;
		workerConfig: ContainerWorkerConfig;
	}
>;
