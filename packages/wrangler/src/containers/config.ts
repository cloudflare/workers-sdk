import path, { dirname } from "node:path";
import { isDockerfile } from "@cloudflare/containers-shared";
import { UserError } from "../errors";
import type { Config } from "../config";

// This normalises config into an intermediate shape for building or pulling.
// We set defaults here too, because we can assume that if the value is undefined,
// we want to revert to the default rather than inheriting from the prev deployment

type InstanceTypeOrDisk =
	| { disk_size: string }
	| { instance_type: "dev" | "basic" | "standard" };
type SharedContainerConfig = {
	name: string;
	class_name: string;
	max_instances: number;
	scheduling_policy: "regional" | "moon" | "default";
	rollout_step_percentage: number;
	rollout_kind: "full_auto" | "none" | "full_manual";
	constraints?: {
		regions?: string[];
		cities?: string[];
		tier?: number;
	};
} & InstanceTypeOrDisk;
export type ContainerNormalisedConfig = SharedContainerConfig &
	(
		| {
				// absolute path, resolved relative to the wrangler config file
				dockerfile: string;
				// absolute path, resolved relative to the wrangler config file
				image_build_context: string;
				image_vars?: Record<string, string>;
		  }
		| { registry_link: string }
	);

// todo add args resolution
export const getNormalizedContainerOptions = async (
	config: Config
): Promise<ContainerNormalisedConfig[]> => {
	if (!config.containers || config.containers.length === 0) {
		return [];
	}

	const normalizedContainers: ContainerNormalisedConfig[] = [];

	for (const container of config.containers) {
		// defaults to worker_name[-envName]-class_name.
		// at this stage, config.name will have had the env name appended to it
		const name =
			container.name ??
			`${config.name}-${container.class_name}`.toLowerCase().replace(/ /g, "-");

		const targetDurableObject = config.durable_objects.bindings.find(
			(durableObject) =>
				durableObject.class_name === container.class_name &&
				// the durable object must be defined in the same script the container is defined in
				durableObject.script_name === undefined
		);

		if (!targetDurableObject) {
			throw new UserError(
				`The container class_name ${container.class_name} does not match any durable object class_name defined in your Wrangler config file. Note that the durable object must be defined in the same script as the container.`
			);
		}
		const shared: Omit<SharedContainerConfig, "disk_size" | "instance_type"> = {
			name,
			class_name: container.class_name,
			max_instances: container.max_instances ?? 1,
			scheduling_policy: container.scheduling_policy ?? "default",
			constraints: container.constraints,
			rollout_step_percentage: container.rollout_step_percentage ?? 25,
			rollout_kind: container.rollout_kind ?? "full_auto",
		};

		let instanceTypeOrDisk: InstanceTypeOrDisk;

		if (container.instance_type) {
			instanceTypeOrDisk = {
				instance_type: container.instance_type ?? "dev",
			};
		} else {
			instanceTypeOrDisk = {
				disk_size: container.configuration?.disk?.size ?? "2GB",
			};
		}

		const maybeDockerfile = isDockerfile(container.image, config.configPath);
		if (maybeDockerfile) {
			const baseDir = config.configPath
				? dirname(config.configPath)
				: process.cwd();

			const absoluteDockerfilePath = path.resolve(baseDir, container.image);
			const absoluteBuildContextPath = container.image_build_context
				? path.resolve(baseDir, container.image_build_context)
				: dirname(absoluteDockerfilePath);
			normalizedContainers.push({
				...shared,
				...instanceTypeOrDisk,
				dockerfile: absoluteDockerfilePath,
				image_build_context: absoluteBuildContextPath,
				image_vars: container.image_vars,
			});
		} else {
			normalizedContainers.push({
				...shared,
				...instanceTypeOrDisk,
				registry_link: container.image, // if it is not a dockerfile, it must be a registry link or have thrown an error
			});
		}
	}

	return normalizedContainers;
};
