import { runDockerCmd } from "@cloudflare/containers-shared/src/utils";

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
 * Performs the forced removal of running Docker containers, given their ids.
 *
 * Please note that this function is almost identical to `cleanupContainers`
 * defined in `containers-shared`, with the exception that the current fn
 * expects the list of ids of all containers that are to be removed, as a
 * parameter. This is because extracting these ids is an async operation, and
 * we are currently restricted from performing async cleanup work upon
 * closing/exiting the vite dev process (see vite-plugin-cloudflare/src/index.ts
 * for more details).
 *
 * @param dockerPath The path to the Docker executable
 * @param containerIds The ids of the containers that should be removed
 */
export async function removeContainersByIds(
	dockerPath: string,
	containerIds: string[]
) {
	try {
		if (containerIds.length === 0) {
			return;
		}

		await runDockerCmd(
			dockerPath,
			["rm", "--force", ...containerIds],
			["inherit", "pipe", "pipe"]
		);
	} catch (error) {
		// fail silently
		return;
	}
}
