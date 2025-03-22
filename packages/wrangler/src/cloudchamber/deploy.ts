import { readFileSync } from "fs";
import path from "path";
import { crash } from "@cloudflare/cli";
import { Config } from "../config";
import { ContainerApp } from "../config/environment";
import { CI } from "../is-ci";
import { Logger } from "../logger";
import { fetchVersion } from "../versions/api";
import { apply } from "./apply";
import { build } from "./build";
import { fillOpenAPIConfiguration } from "./common";

export async function buildContainers(config: Config, workerTag: string) {
	if (config.containers === undefined) return;

	for (const container of config.containers) {
		const options = getBuildArguments(container, workerTag, true);
		if (options.isDockerImage) await build(options);
	}
}

export async function deployContainers(
	logger: Logger,
	config: Config,
	{
		versionId,
		accountId,
		scriptName,
		dryRun,
		env,
	}: {
		versionId: string;
		accountId: string;
		scriptName: string;
		dryRun?: boolean;
		env?: string;
	}
) {
	if (config.containers === undefined) return;

	if (!dryRun) {
		await fillOpenAPIConfiguration(config, CI.isCI());
	}

	for (const container of config.containers) {
		const version = await fetchVersion(accountId, scriptName, versionId);
		const targetDurableObject = version.resources.bindings.filter(
			(durableObject) =>
				durableObject.type === "durable_object_namespace" &&
				durableObject.class_name === container.class_name &&
				durableObject.script_name === undefined &&
				durableObject.namespace_id !== undefined
		);

		if (targetDurableObject.length <= 0) {
			logger.error(
				"Could not deploy container application as durable object was not found in list of bindings"
			);
			continue;
		}

		const [targetDurableObjectNamespace] = targetDurableObject;
		if (
			targetDurableObjectNamespace.type !== "durable_object_namespace" ||
			targetDurableObjectNamespace.namespace_id === undefined
		)
			throw new Error("unreachable");

		const configuration = {
			...config,
			containers: [
				{
					...container,
					durable_objects: {
						namespace_id: targetDurableObjectNamespace.namespace_id,
					},
				},
			],
		};

		const buildOptions = getBuildArguments(container, versionId, dryRun);

		if (buildOptions.isDockerImage)
			logger.log("Building image", buildOptions.tag);

		const image = buildOptions.isDockerImage
			? await build(buildOptions)
			: container.image ?? container.configuration.image;

		container.configuration.image = image;
		container.image = image;

		await apply({ skipDefaults: false, json: true, env }, configuration);
	}
}

function getBuildArguments(
	container: ContainerApp,
	versionId: string,
	dryRun?: boolean
) {
	let isDockerImage = false;
	const imageRef = container.image ?? container.configuration.image;

	const imagePath = path.resolve(imageRef);
	let dockerfile = "";
	try {
		const dockerfileContents = readFileSync(imagePath, "utf8");
		isDockerImage = true;
		dockerfile = dockerfileContents;
	} catch (err) {
		if (!(err instanceof Error)) {
			throw err;
		}

		if ((err as Error & { code: string }).code !== "ENOENT") {
			throw new Error(`Error reading file ${imagePath}: ${err.message}`);
		}

		// not found, not a dockerfile, let's try parting the image ref as an URL?
		isDockerImage = false;
		try {
			if (!imageRef.includes(":")) {
				throw new Error("image reference needs to include atleast a tag ':'");
			}

			const url = new URL(`https://${imageRef}`);
			if (url.protocol !== "https:") {
				throw new Error("invalid protocol");
			}
		} catch (err) {
			crash(
				`The image ${imageRef} could not be found, and the image is not a valid reference (e.g: docker.io/httpd:1)`
			);
		}
	}

	const imageTag = container.name + ":" + (versionId ?? "dryrun").split("-")[0];

	const buildOptions = {
		tag: imageTag,
		pathToDockerfileDirectory:
			container.image_build_context ??
			path.dirname(container.image ?? container.configuration.image),
		// TODO: configurable
		pathToDocker: "docker",
		push: !dryRun,
		dockerfileContents: dockerfile,
		isDockerImage,
		args: container.image_vars,
	} as const;
	return buildOptions;
}
