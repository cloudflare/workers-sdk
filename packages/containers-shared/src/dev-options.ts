import path from "node:path";
import {
	isDockerfile,
	isDurableObjectContainerApp,
	resolveContainerClassName,
} from "@cloudflare/workers-utils";
import { getDevContainerImageName } from "./knobs";
import type { ContainerDevOptions } from "./types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Converts normalized Worker container configuration into local image build or
 * pull options.
 *
 * @param options - Worker container configuration and generated build ID.
 * @returns Local image options, or `undefined` when no containers are configured.
 */
export function createContainerDevOptions(options: {
	containers: Config["containers"];
	exports: Config["exports"];
	containerBuildId: string;
	configPath?: string;
}): ContainerDevOptions[] | undefined {
	const { containers, exports, containerBuildId, configPath } = options;

	if (!containers?.length) {
		return undefined;
	}

	return containers.flatMap((container): ContainerDevOptions[] => {
		if (
			isDurableObjectContainerApp(container) ||
			container.image === undefined
		) {
			return [];
		}

		const className = resolveContainerClassName(container, exports);
		if (className === undefined) {
			return [];
		}

		const imageTag = getDevContainerImageName(className, containerBuildId);
		if (isDockerfile(container.image, configPath)) {
			return [
				{
					dockerfile: container.image,
					image_build_context:
						container.image_build_context ?? path.dirname(container.image),
					image_vars: container.image_vars,
					class_name: className,
					image_tag: imageTag,
				},
			];
		}

		return [
			{
				image_uri: container.image,
				class_name: className,
				image_tag: imageTag,
			},
		];
	});
}
