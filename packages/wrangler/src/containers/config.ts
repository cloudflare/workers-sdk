import assert from "node:assert";
import path, { dirname } from "node:path";
import {
	InstanceType,
	isDockerfile,
	resolveImageName,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { UserError } from "../errors";
import { getAccountId } from "../user";
import type { Config } from "../config";
import type {
	ContainerNormalizedConfig,
	InstanceTypeOrLimits,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";

/**
 * This normalises config into an intermediate shape for building or pulling.
 * We set defaults here too, because we can assume that if the value is undefined,
 * we want to revert to the default rather than inheriting from the prev deployment
 */
export const getNormalizedContainerOptions = async (
	config: Config
): Promise<ContainerNormalizedConfig[]> => {
	if (!config.containers || config.containers.length === 0) {
		return [];
	}

	const normalizedContainers: ContainerNormalizedConfig[] = [];

	for (const container of config.containers) {
		assert(container.name, "container name should have been set by validation");
		const targetDurableObject = config.durable_objects.bindings.find(
			(durableObject) => durableObject.class_name === container.class_name
		);
		if (!targetDurableObject) {
			throw new UserError(
				`The container class_name ${container.class_name} does not match any durable object class_name defined in your Wrangler config file. Note that the durable object must be defined in the same script as the container.`,
				{ telemetryMessage: "no DO defined that matches container class_name" }
			);
		}

		if (targetDurableObject.script_name !== undefined) {
			throw new UserError(
				`The container ${container.name} is referencing the durable object ${container.class_name}, which appears to be defined on the ${targetDurableObject.script_name} Worker instead (via the 'script_name' field). You cannot configure a container on a Durable Object that is defined in another Worker.`,
				{
					telemetryMessage:
						"contaienr class_name refers to an external durable object",
				}
			);
		}

		const shared: Omit<SharedContainerConfig, "disk_size" | "instance_type"> = {
			name: container.name,
			class_name: container.class_name,
			max_instances: container.max_instances ?? 0,
			scheduling_policy: (container.scheduling_policy ??
				SchedulingPolicy.DEFAULT) as SchedulingPolicy,
			constraints: {
				tier: container.constraints?.tier ?? 1,
				regions: container.constraints?.regions?.map((region) =>
					region.toUpperCase()
				),
				cities: container.constraints?.cities?.map((city) =>
					city.toLowerCase()
				),
			},
			rollout_step_percentage: container.rollout_step_percentage ?? 25,
			rollout_kind: container.rollout_kind ?? "full_auto",
			observability: {
				logs_enabled:
					config.observability?.logs?.enabled ??
					config.observability?.enabled === true,
			},
		};

		let instanceTypeOrDisk: InstanceTypeOrLimits;

		if (
			container.configuration?.disk !== undefined ||
			container.configuration?.vcpu !== undefined ||
			container.configuration?.memory_mib !== undefined
		) {
			const MB = 1000 * 1000;
			// if an individual limit is not set, default to the dev instance type values
			instanceTypeOrDisk = {
				disk_bytes: (container.configuration.disk?.size_mb ?? 2000) * MB, // defaults to 2GB in bytes
				vcpu: container.configuration?.vcpu ?? 0.0625,
				memory_mib: container.configuration?.memory_mib ?? 256,
			};
		} else {
			instanceTypeOrDisk = {
				instance_type: (container.instance_type ??
					InstanceType.DEV) as InstanceType,
			};
		}

		const maybeDockerfile = isDockerfile(container.image, config.configPath);
		if (maybeDockerfile) {
			// these should have been resolved to absolute paths by the config validation
			assert(
				path.isAbsolute(container.image),
				"Dockerfile path should be absolute"
			);
			const imageBuildContext =
				container.image_build_context ?? dirname(container.image);
			assert(
				path.isAbsolute(imageBuildContext),
				"resolved image_build_context should be defined"
			);
			normalizedContainers.push({
				...shared,
				...instanceTypeOrDisk,
				dockerfile: container.image,
				image_build_context: imageBuildContext,
				image_vars: container.image_vars,
			});
		} else {
			const accountId = await getAccountId(config);
			normalizedContainers.push({
				...shared,
				...instanceTypeOrDisk,
				image_uri: resolveImageName(accountId, container.image), // if it is not a dockerfile, it must be an image uri or have thrown an error
			});
		}
	}

	return normalizedContainers;
};
