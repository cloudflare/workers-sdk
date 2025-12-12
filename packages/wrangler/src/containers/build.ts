import { buildAndMaybePush } from "../cloudchamber/build";
import { logger } from "../logger";
import type { ImageRef } from "../cloudchamber/build";
import type {
	ContainerNormalizedConfig,
	ImageURIConfig,
} from "@cloudflare/containers-shared";

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
