import { isDockerfile } from "@cloudflare/containers-shared";
import { type Config } from "../config";
import { type ContainerApp } from "../config/environment";
import { containersScope } from "../containers";
import { getDockerPath } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { apply } from "./apply";
import { buildAndMaybePush } from "./build";
import { fillOpenAPIConfiguration } from "./common";
import type { BuildArgs } from "@cloudflare/containers-shared/src/types";

export async function maybeBuildContainer(
	containerConfig: ContainerApp,
	/** just the tag component. will be prefixed with the container name */
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string
): Promise<{ image: string; pushed: boolean }> {
	try {
		if (
			!isDockerfile(
				containerConfig.image ?? containerConfig.configuration?.image
			)
		) {
			return {
				image: containerConfig.image ?? containerConfig.configuration?.image,
				pushed: false,
			};
		}
	} catch (err) {
		if (err instanceof Error) {
			throw new UserError(err.message);
		}

		throw err;
	}

	const options = getBuildArguments(containerConfig, imageTag);
	logger.log("Building image", options.tag);
	const buildResult = await buildAndMaybePush(
		options,
		pathToDocker,
		!dryRun,
		containerConfig
	);
	return buildResult;
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
	{ versionId, accountId, scriptName, dryRun, env }: DeployContainersArgs
) {
	if (config.containers === undefined) {
		return;
	}

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, containersScope);
	}
	const pathToDocker = getDockerPath();
	for (const container of config.containers) {
		const version = await fetchVersion(
			config,
			accountId,
			scriptName,
			versionId
		);
		const targetDurableObject = version.resources.bindings.find(
			(durableObject) =>
				durableObject.type === "durable_object_namespace" &&
				durableObject.class_name === container.class_name &&
				durableObject.script_name === undefined &&
				durableObject.namespace_id !== undefined
		);

		if (!targetDurableObject) {
			throw new UserError(
				"Could not deploy container application as durable object was not found in list of bindings"
			);
		}

		if (
			targetDurableObject.type !== "durable_object_namespace" ||
			targetDurableObject.namespace_id === undefined
		) {
			throw new Error("unreachable");
		}

		const configuration = {
			...config,
			containers: [
				{
					...container,
					durable_objects: {
						namespace_id: targetDurableObject.namespace_id,
					},
				},
			],
		};

		const buildResult = await maybeBuildContainer(
			container,
			versionId,
			dryRun,
			pathToDocker
		);
		container.configuration ??= {};
		container.configuration.image = buildResult.image;
		container.image = buildResult.image;

		await apply(
			{
				skipDefaults: false,
				env,
				imageUpdateRequired: buildResult.pushed,
			},
			configuration
		);
	}
}

// TODO: container app config should be normalized by now in config validation
// getBuildArguments takes the image from `container.image` or `container.configuration.image`
// if the first is not defined. It accepts either a URI or path to a Dockerfile.
// It will return options that are usable with the build() method from containers.
export function getBuildArguments(
	container: ContainerApp,
	idForImageTag: string
): BuildArgs {
	const imageRef = container.image ?? container.configuration?.image;
	const imageTag = container.name + ":" + idForImageTag.split("-")[0];

	return {
		tag: imageTag,
		pathToDockerfile: imageRef,
		buildContext: container.image_build_context ?? ".",
		args: container.image_vars,
	};
}
