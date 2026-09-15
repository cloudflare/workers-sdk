import { getContainerConfigExports } from "@cloudflare/config";
import { buildAndWriteContainerOutput } from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils";
import type { ResolvedPluginConfig } from "./plugin-config";

/**
 * Build and write the Container portion of the Build Output Specification.
 *
 * @param resolvedPluginConfig - The resolved Cloudflare Vite plugin config.
 * @param root - The Vite project root and Build Output root.
 */
export async function buildOutputContainers(
	resolvedPluginConfig: ResolvedPluginConfig,
	root: string
): Promise<void> {
	if (
		resolvedPluginConfig.type === "preview" ||
		resolvedPluginConfig.experimental.newConfig?.cfBuildOutput !== true
	) {
		return;
	}

	const config = resolvedPluginConfig.parsedNewConfig;
	if (config === undefined) {
		return;
	}

	await buildAndWriteContainerOutput({
		containers: getContainerConfigExports(config),
		root,
		pathToDocker: getDockerPath(),
	});
}
