import * as fsp from "node:fs/promises";
import {
	getContainersDir,
	writeContainerConfig,
} from "@cloudflare/build-output-utils";
import {
	buildOutputContainerConfigs,
	cleanupBuiltImages,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "./containers";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { ParsedInputContainerConfig } from "@cloudflare/config";

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

	const containers = Object.entries(resolvedPluginConfig.parsedNewConfig ?? {})
		.filter((entry): entry is [string, ParsedInputContainerConfig] => {
			return entry[1]?.type === "container";
		})
		.map(([directoryName, config]) => ({ directoryName, config }));
	const pathToDocker = getDockerPath();
	const result = await buildOutputContainerConfigs({
		containers,
		root,
		pathToDocker,
	});

	try {
		for (const container of result.containers) {
			await writeContainerConfig({ root, ...container });
		}
	} catch (error) {
		await Promise.all([
			fsp.rm(getContainersDir(root), { force: true, recursive: true }),
			cleanupBuiltImages(result.builtImages, pathToDocker),
		]);
		throw error;
	}
}
