import assert from "node:assert";
import path, { dirname } from "node:path";
import {
	InstanceType,
	isDockerfile,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { UserError } from "../errors";
import { parseByteSize } from "../parse";
import type { Config } from "../config";
import type {
	ContainerNormalisedConfig,
	InstanceTypeOrLimits,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";

// This normalises config into an intermediate shape for building or pulling.
// We set defaults here too, because we can assume that if the value is undefined,
// we want to revert to the default rather than inheriting from the prev deployment

// todo add args resolution
export const getNormalizedContainerOptions = async (
	config: Config
): Promise<ContainerNormalisedConfig[]> => {
	if (!config.containers || config.containers.length === 0) {
		return [];
	}

	const normalizedContainers: ContainerNormalisedConfig[] = [];

	for (const container of config.containers) {
		assert(container.name, "container name should have been set by validation");
		const targetDurableObject = config.durable_objects.bindings.find(
			(durableObject) =>
				durableObject.class_name === container.class_name &&
				// the durable object must be defined in the same script as the container
				durableObject.script_name === undefined
		);

		if (!targetDurableObject) {
			throw new UserError(
				`The container class_name ${container.class_name} does not match any durable object class_name defined in your Wrangler config file. Note that the durable object must be defined in the same script as the container.`
			);
		}

		const shared: Omit<SharedContainerConfig, "disk_size" | "instance_type"> = {
			name: container.name,
			class_name: container.class_name,
			max_instances: container.max_instances ?? 0, // :(
			scheduling_policy: (container.scheduling_policy ??
				SchedulingPolicy.DEFAULT) as SchedulingPolicy,
			constraints: container.constraints,
			rollout_step_percentage: container.rollout_step_percentage ?? 25,
			rollout_kind: container.rollout_kind ?? "full_auto", // this is the default in the API, so we use it here too				,
		};

		let instanceTypeOrDisk: InstanceTypeOrLimits;

		if (
			container.configuration?.disk !== undefined ||
			container.configuration?.vcpu !== undefined ||
			container.configuration?.memory_mib !== undefined ||
			// this is doubly deprecated, do we need to support this?
			container.configuration?.memory !== undefined
		) {
			let normalisedDiskSize: number | undefined;
			if (container.configuration?.disk !== undefined) {
				normalisedDiskSize =
					"size" in container.configuration.disk
						? // 	// have i got the right units here?
							Math.round(
								parseByteSize(container.configuration.disk.size ?? "2GB")
							)
						: container.configuration.disk.size_mb;
			}

			instanceTypeOrDisk = {
				disk_size: normalisedDiskSize,
				vcpu: container.configuration?.vcpu,
				memory_mib:
					container.configuration.memory !== undefined
						? Math.round(parseByteSize(container.configuration?.memory))
						: container.configuration?.memory_mib,
			};
		} else {
			instanceTypeOrDisk = {
				instance_type: (container.instance_type ??
					InstanceType.DEV) as InstanceType,
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
