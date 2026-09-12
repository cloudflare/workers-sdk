import {
	configureOpenAPIForContainerPull,
	createContainerDevOptions,
} from "@cloudflare/containers-shared";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getCloudflareApiBaseUrl,
} from "@cloudflare/workers-utils";
import type { ResolvedWorkerConfig } from "./plugin-config";
import type { ContainerDevOptions } from "@cloudflare/containers-shared";
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
	return createContainerDevOptions({
		containers: containersConfig,
		exports,
		containerBuildId,
		configPath,
	});
}

export type ContainerTagToOptionsMap = Map<string, ContainerDevOptions>;
