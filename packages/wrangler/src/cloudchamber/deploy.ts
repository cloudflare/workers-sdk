import assert from "assert";
import { UserError } from "@cloudflare/workers-utils";
import { containersScope } from "../containers";
import { apply } from "../containers/deploy";
import { getDockerPath } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { buildAndMaybePush } from "./build";
import { fillOpenAPIConfiguration } from "./common";
import type { ImageRef } from "./build";
import type {
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "@cloudflare/containers-shared/src/types";
import type { Config } from "@cloudflare/workers-utils";

export async function buildContainer(
	containerConfig: Exclude<ContainerNormalizedConfig, ImageURIConfig>,
	/** just the tag component. will be prefixed with the container name */
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string
): Promise<ImageRef> {
	const imageFullName = containerConfig.name + ":" + imageTag.split("-")[0];
	logger.log("Building image", imageFullName);

	return await buildAndMaybePush(
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
	let imageRef: ImageRef;
	for (const container of normalisedContainerConfig) {
		if ("dockerfile" in container) {
			imageRef = await buildContainer(
				container,
				versionId,
				false,
				pathToDocker
			);
		} else {
			imageRef = { newTag: container.image_uri };
		}
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
				imageRef,
				durable_object_namespace_id: targetDurableObject.namespace_id,
			},
			container,
			config
		);
	}
}
