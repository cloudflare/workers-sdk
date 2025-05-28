import { readFileSync, statSync } from "fs";
import path from "path";
import { type Config } from "../config";
import { type ContainerApp } from "../config/environment";
import { getDockerPath } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { apply } from "./apply";
import { build } from "./build";
import { fillOpenAPIConfiguration } from "./common";

export async function buildContainers(config: Config, imageTag: string) {
	if (config.containers === undefined) {
		return;
	}

	for (const container of config.containers) {
		const options = getBuildArguments(container, imageTag, true);
		if (options.isDockerImage) {
			await build(options);
		}
	}
}

export type DeployContainersArgs = {
	versionId: string;
	accountId: string;
	scriptName: string;
	dryRun?: boolean;
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

		const buildOptions = getBuildArguments(container, versionId, dryRun);

		if (buildOptions.isDockerImage) {
			logger.log("Building image", buildOptions.tag);
		}

		const image = buildOptions.isDockerImage
			? await build(buildOptions)
			: container.image ?? container.configuration.image;

		container.configuration.image = image;
		container.image = image;

		await apply({ skipDefaults: false, json: true, env }, configuration);
	}
}

// getBuildArguments takes the image from `container.image` or `container.configuration.image`
// if the first is not defined. It accepts either a URI or path to a Dockerfile.
// It will return options that are usable with the build() method from containers.
export function getBuildArguments(
	container: ContainerApp,
	idForImageTag: string,
	dryRun?: boolean
) {
	const imageRef = container.image ?? container.configuration.image;

	const imagePath = path.resolve(imageRef);
	let dockerfile = "";
	try {
		const fd = statSync(imagePath);
		// Assume it's a Dockerfile
		if (fd.isDirectory()) {
			throw new UserError(
				`${imagePath} is a directory, you should specify a path to the Dockerfile`
			);
		}

		const dockerfileContents = readFileSync(imagePath, "utf8");
		dockerfile = dockerfileContents;
	} catch (err) {
		if (!(err instanceof Error)) {
			throw err;
		}

		if ((err as Error & { code: string }).code !== "ENOENT") {
			throw new UserError(`Error reading file ${imagePath}: ${err.message}`);
		}

		// not found, not a dockerfile, let's try parsing the image ref as an URL?
		try {
			const imageParts = imageRef.split("/");
			if (!imageParts[imageParts.length - 1].includes(":")) {
				throw new UserError(
					`image needs to include atleast a tag ':' (e.g: docker.io/httpd:1)`
				);
			}

			// validate URL
			new URL(`https://${imageRef}`);
			if (imageRef.includes("://")) {
				throw new UserError(
					`should not include the protocol part (e.g: docker.io/httpd:1, not https://docker.io/httpd:1)`
				);
			}
		} catch (errParsingURL) {
			if (!(errParsingURL instanceof UserError)) {
				throw err;
			}

			throw new UserError(
				`The image ${imageRef} could not be found, and the image is not a valid reference: ${errParsingURL.message}`
			);
		}

		return { isDockerImage: false } as const;
	}

	const imageTag = container.name + ":" + idForImageTag.split("-")[0];

	const dockerPath = getDockerPath();
	const buildOptions = {
		tag: imageTag,
		pathToDockerfileDirectory:
			container.image_build_context ??
			path.dirname(container.image ?? container.configuration.image),
		pathToDocker: dockerPath,
		push: !dryRun,
		dockerfileContents: dockerfile,
		isDockerImage: true,
		args: container.image_vars,
	} as const;
	return buildOptions;
}
