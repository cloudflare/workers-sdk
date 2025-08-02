import assert from "assert";
import { type Config } from "../config";
import { containersScope } from "../containers";
import { apply } from "../containers/deploy";
import { getDockerPath } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { buildAndMaybePush } from "./build";
import { fillOpenAPIConfiguration } from "./common";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared/src/types";

export async function maybeBuildContainer(
	containerConfig: ContainerNormalizedConfig,
	/** just the tag component. will be prefixed with the container name */
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string
): Promise<{ newImageLink: string | undefined }> {
	if ("image_uri" in containerConfig) {
		return {
			// We don't know at this point whether the image has changed
			// but we need to make sure API checks so
			// we always set this to the registry link.
			newImageLink: containerConfig.image_uri,
		};
	}
	const imageFullName = containerConfig.name + ":" + imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	const buildResult = await buildAndMaybePush(
		{
			tag: imageFullName,
			pathToDockerfile: containerConfig.dockerfile,
			buildContext: containerConfig.image_build_context,
			args: containerConfig.image_vars,
		},
		pathToDocker,
		!dryRun,
		containerConfig
	);

	if (buildResult.pushed) {
		return { newImageLink: buildResult.image };
	}
	// if the image has not changed, it will not have been pushed
	// so we don't need to update anything when we apply the container config
	return { newImageLink: undefined };
}

export type DeployContainersArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
	dryRun: boolean;
	env?: string;
};

export async function deployContainers(
	config: Config,
	normalisedContainerConfig: ContainerNormalizedConfig[],
	{ versionId, accountId, scriptName }: DeployContainersArgs
) {
	await fillOpenAPIConfiguration(config, containersScope);

	const pathToDocker = getDockerPath();
	const version = await fetchVersion(config, accountId, scriptName, versionId);
	for (const container of normalisedContainerConfig) {
		const buildResult = await maybeBuildContainer(
			container,
			versionId,
			false,
			pathToDocker
		);
		const targetDurableObject = version.resources.bindings.find(
			(durableObject) =>
				durableObject.type === "durable_object_namespace" &&
				durableObject.class_name === container.class_name &&
				// DO cannot be defined in a different script to the container
				durableObject.script_name === undefined &&
				durableObject.namespace_id !== undefined
		);

		if (!targetDurableObject) {
			throw new UserError(
				"Could not deploy container application as durable object was not found in list of bindings"
			);
		}

		assert(
			targetDurableObject.type === "durable_object_namespace" &&
				targetDurableObject.namespace_id !== undefined
		);

		await apply(
			{
				newImageLink: buildResult.newImageLink,
				durable_object_namespace_id: targetDurableObject.namespace_id,
			},
			container,
			config
		);
	}
}
