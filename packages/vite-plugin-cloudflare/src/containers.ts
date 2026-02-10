import path from "node:path";
import { getDevContainerImageName } from "@cloudflare/containers-shared/src/knobs";
import { isDockerfile } from "@cloudflare/workers-utils";
import type { ResolvedWorkerConfig } from "./plugin-config";

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
 * containers are not enabled or not configured.
 */
export function getContainerOptions(options: {
	containersConfig: ResolvedWorkerConfig["containers"];
	containerBuildId: string;
	configPath?: string;
}) {
	const { containersConfig, containerBuildId, configPath } = options;

	if (!containersConfig?.length) {
		return undefined;
	}

	return containersConfig.map((container) => {
		if (isDockerfile(container.image, configPath)) {
			return {
				dockerfile: container.image,
				image_build_context:
					container.image_build_context ?? path.dirname(container.image),
				image_vars: container.image_vars,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			};
		} else {
			return {
				image_uri: container.image,
				class_name: container.class_name,
				image_tag: getDevContainerImageName(
					container.class_name,
					containerBuildId
				),
			};
		}
	});
}

export type ContainerTagToOptionsMap = Map<
	string,
	NonNullable<ReturnType<typeof getContainerOptions>>[number]
>;
