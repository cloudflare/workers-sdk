import type { ContainerEngine } from "@cloudflare/workers-utils";

/**
 * Adds an explicit daemon endpoint to a Docker CLI invocation.
 *
 * Docker global options must precede the subcommand, so callers should pass
 * arguments beginning with the Docker command name.
 *
 * @param args - Docker CLI arguments beginning with the command name.
 * @param dockerHost - Docker daemon endpoint selected for the runtime.
 * @returns Arguments with the global `--host` option when an endpoint is set.
 */
export function getDockerCommandArgs(
	args: string[],
	dockerHost?: string
): string[] {
	return dockerHost === undefined ? args : ["--host", dockerHost, ...args];
}

/**
 * Returns the Docker endpoint represented by a Miniflare container engine.
 *
 * @param containerEngine - Runtime container-engine configuration.
 * @returns The Docker socket or endpoint used by the runtime.
 */
export function getDockerHostFromContainerEngine(
	containerEngine: ContainerEngine
): string {
	return typeof containerEngine === "string"
		? containerEngine
		: containerEngine.localDocker.socketPath;
}
