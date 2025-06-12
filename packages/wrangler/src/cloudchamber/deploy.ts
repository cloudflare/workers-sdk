import { existsSync } from "fs";
import { type Config } from "../config";
import { type ContainerApp } from "../config/environment";
import { getDockerPath } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { apply } from "./apply";
import { buildAndMaybePush, isDir } from "./build";
import { fillOpenAPIConfiguration } from "./common";
import type { BuildArgs } from "@cloudflare/containers-shared/src/types";

export async function maybeBuildContainer(
	containerConfig: ContainerApp,
	/** just the tag component. will be prefixed with the container name */
	imageTag: string,
	dryRun: boolean,
	pathToDocker: string
) {
	if (
		!isDockerfile(containerConfig.image ?? containerConfig.configuration.image)
	) {
		return containerConfig.image ?? containerConfig.configuration.image;
	}
	const options = getBuildArguments(containerConfig, imageTag);
	logger.log("Building image", options.tag);
	const tag = await buildAndMaybePush(
		options,
		pathToDocker,
		!dryRun,
		containerConfig
	);
	return tag;
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
		await fillOpenAPIConfiguration(config, isNonInteractiveOrCI());
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

		const image = await maybeBuildContainer(
			container,
			versionId,
			dryRun,
			pathToDocker
		);

		container.configuration.image = image;
		container.image = image;

		await apply({ skipDefaults: false, json: true, env }, configuration);
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
	const imageRef = container.image ?? container.configuration.image;
	const imageTag = container.name + ":" + idForImageTag.split("-")[0];

	return {
		tag: imageTag,
		pathToDockerfile: imageRef,
		buildContext: container.image_build_context ?? ".",
		args: container.image_vars,
	};
}

export const isDockerfile = (image: string): boolean => {
	// TODO: move this into config validation
	if (existsSync(image)) {
		if (isDir(image)) {
			throw new UserError(
				`${image} is a directory, you should specify a path to the Dockerfile`
			);
		}
		return true;
	}

	const errorPrefix = `The image "${image}" does not appear to be a valid path to a Dockerfile, or a valid image registry path:\n`;
	// not found, not a dockerfile, let's try parsing the image ref as an URL?
	try {
		new URL(`https://${image}`);
	} catch (e) {
		if (e instanceof Error) {
			throw new UserError(errorPrefix + e.message);
		}
		throw e;
	}
	const imageParts = image.split("/");

	if (!imageParts[imageParts.length - 1].includes(":")) {
		throw new UserError(
			errorPrefix +
				`If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)`
		);
	}

	// validate URL
	if (image.includes("://")) {
		throw new UserError(
			errorPrefix +
				`Image reference should not include the protocol part (e.g: docker.io/httpd:1, not https://docker.io/httpd:1)`
		);
	}
	return false;
};
