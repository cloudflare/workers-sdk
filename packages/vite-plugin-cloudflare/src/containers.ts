import path from "node:path";
import {
	getDevContainerImageName,
	initContainersSharedContext,
} from "@cloudflare/containers-shared";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	fetchResultBase,
	isDockerfile,
	resolveContainerClassName,
} from "@cloudflare/workers-utils";
import type { ResolvedWorkerConfig } from "./plugin-config";
import type {
	ApiCredentials,
	ComplianceConfig,
	FetchResultFetcher,
	Logger,
} from "@cloudflare/workers-utils";

/**
 * Configures the Containers shared helpers used to retrieve image pull credentials.
 *
 * @param accountId - Cloudflare account ID that owns the managed registry.
 * @param apiToken - API token used to request registry credentials.
 * @param logger - Vite logger used for API debug output.
 * @param complianceConfig - Compliance configuration used to select the API endpoint.
 * @returns No value.
 */
export function configureContainerPull(
	accountId: string,
	apiToken: string,
	logger: Pick<Logger, "info" | "warn" | "error">,
	complianceConfig?: ComplianceConfig
): void {
	const credentials: ApiCredentials = { apiToken };
	const fetchResult: FetchResultFetcher = async (
		requestComplianceConfig,
		resource,
		init,
		queryParams,
		abortSignal
	) => {
		return fetchResultBase(
			requestComplianceConfig,
			resource,
			init,
			"@cloudflare/vite-plugin",
			{
				debug: () => {},
				log: logger.info,
				info: logger.info,
				warn: logger.warn,
				error: logger.error,
			},
			queryParams,
			abortSignal,
			credentials
		);
	};

	initContainersSharedContext({
		accountId,
		apiFamily: "containers",
		fetchResult: async (requestComplianceConfig, ...args) =>
			fetchResult(
				requestComplianceConfig ??
					complianceConfig ??
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
				...args
			),
	});
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

/**
 * @returns Container options suitable for building or pulling images,
 * with image tag set to well-known dev format, or undefined if
 * containers are not enabled or not configured. Containers that are
 * configured but resolve to no Durable Object class are dropped, so the
 * result may also be an empty array. Both mean there is nothing to build
 * or pull, and callers treat them alike.
 */
export function getContainerOptions(options: {
	containersConfig: ResolvedWorkerConfig["containers"];
	exports: ResolvedWorkerConfig["exports"];
	containerBuildId: string;
	configPath?: string;
}) {
	const { containersConfig, exports, containerBuildId, configPath } = options;

	if (!containersConfig?.length) {
		return undefined;
	}

	return containersConfig
		.map((container) => {
			// A container is linked to its Durable Object either by its own `class_name`,
			// or by the Durable Object's `exports` entry naming it via `container`.
			// Config validation rejects containers with neither.
			const className = resolveContainerClassName(container, exports);
			if (className === undefined) {
				return undefined;
			}

			const image_tag = getDevContainerImageName(className, containerBuildId);

			if (isDockerfile(container.image, configPath)) {
				return {
					dockerfile: container.image,
					image_build_context:
						container.image_build_context ?? path.dirname(container.image),
					image_vars: container.image_vars,
					class_name: className,
					image_tag,
				};
			} else {
				return {
					image_uri: container.image,
					class_name: className,
					image_tag,
				};
			}
		})
		.filter((container) => container !== undefined);
}

export type ContainerTagToOptionsMap = Map<
	string,
	NonNullable<ReturnType<typeof getContainerOptions>>[number]
>;
