import assert from "node:assert";
import path, { dirname } from "node:path";
import {
	InstanceType,
	isDockerfile,
	resolveImageName,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { UserError } from "@cloudflare/workers-utils";
import { getDurableObjectClassNameToUseSQLiteMap } from "../dev/class-names-sqlite";
import { getAccountId } from "../user";
import type {
	ApplicationAffinities,
	ApplicationAffinityColocation,
	ContainerNormalizedConfig,
	InstanceTypeOrLimits,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";
import type { ApplicationAffinityHardwareGeneration } from "@cloudflare/containers-shared/src/client/models/ApplicationAffinityHardwareGeneration";
import type { Config, ContainerApp } from "@cloudflare/workers-utils";

/**
 * Perform type conversion of affinities so that they can be fed to the API.
 */
function convertContainerAffinitiesForApi(
	container: ContainerApp
): ApplicationAffinities | undefined {
	if (container.affinities === undefined) {
		return undefined;
	}

	const affinities: ApplicationAffinities = {
		colocation: container.affinities?.colocation as
			| ApplicationAffinityColocation
			| undefined,
		hardware_generation: container.affinities?.hardware_generation as
			| ApplicationAffinityHardwareGeneration
			| undefined,
	};

	return affinities;
}

/**
 * This normalises config into an intermediate shape for building or pulling.
 * We set defaults here too, because we can assume that if the value is undefined,
 * we want to revert to the default rather than inheriting from the prev deployment
 */
export const getNormalizedContainerOptions = async (
	config: Config,
	args: {
		/** set by args.containersRollout */
		containersRollout?: "gradual" | "immediate";
		dryRun?: boolean;
	}
): Promise<ContainerNormalizedConfig[]> => {
	if (!config.containers || config.containers.length === 0) {
		return [];
	}

	const normalizedContainers: ContainerNormalizedConfig[] = [];

	for (const container of config.containers) {
		assert(container.name, "container name should have been set by validation");
		const allDOs = getDurableObjectClassNameToUseSQLiteMap(config.migrations);

		if (
			!allDOs.has(container.class_name) &&
			config.durable_objects.bindings.find(
				(doBinding) => doBinding.class_name === container.class_name
			) === undefined
		) {
			throw new UserError(
				`The container class_name ${container.class_name} does not match any durable object class_name defined in your Wrangler config file. Note that the durable object must be defined in the same script as the container.`,
				{ telemetryMessage: "no DO defined that matches container class_name" }
			);
		}
		const maybeBoundDO = config.durable_objects.bindings.find(
			(durableObject) => durableObject.class_name === container.class_name
		);
		if (maybeBoundDO && maybeBoundDO.script_name !== undefined) {
			throw new UserError(
				`The container ${container.name} is referencing the durable object ${container.class_name}, which appears to be defined on the ${maybeBoundDO.script_name} Worker instead (via the 'script_name' field). You cannot configure a container on a Durable Object that is defined in another Worker.`,
				{
					telemetryMessage:
						"contaienr class_name refers to an external durable object",
				}
			);
		}

		const rolloutStepPercentageFallback =
			(container.max_instances ?? 0) < 2 ? 100 : [10, 100];

		// tiers will take precedence over tier
		// if unset, wrangler will default to [1, 2]
		// A value of -1 will be treated as "all tiers"
		let tiers: number[] | undefined;
		if (container.constraints?.tiers) {
			tiers = container.constraints.tiers;
		} else if (container.constraints?.tier === -1) {
			tiers = undefined;
		} else if (container.constraints?.tier) {
			tiers = [container.constraints.tier];
		} else {
			tiers = [1, 2];
		}

		const shared: Omit<SharedContainerConfig, "disk_size" | "instance_type"> = {
			name: container.name,
			class_name: container.class_name,
			max_instances: container.max_instances ?? 20,
			scheduling_policy: (container.scheduling_policy ??
				SchedulingPolicy.DEFAULT) as SchedulingPolicy,
			constraints: {
				tiers,
				regions: container.constraints?.regions?.map((region) =>
					region.toUpperCase()
				),
				cities: container.constraints?.cities?.map((city) =>
					city.toLowerCase()
				),
			},
			affinities: convertContainerAffinitiesForApi(container),
			rollout_step_percentage:
				args?.containersRollout === "immediate"
					? 100
					: container.rollout_step_percentage ?? rolloutStepPercentageFallback,
			rollout_kind: container.rollout_kind ?? "full_auto",
			rollout_active_grace_period: container.rollout_active_grace_period ?? 0,
			observability: {
				logs_enabled:
					config.observability?.logs?.enabled ??
					config.observability?.enabled === true,
			},
			wrangler_ssh: container.wrangler_ssh,
			authorized_keys: container.authorized_keys,
			trusted_user_ca_keys: container.trusted_user_ca_keys,
		};

		let instanceTypeOrLimits: InstanceTypeOrLimits;
		const MB = 1000 * 1000;
		if (
			container.configuration?.disk !== undefined ||
			container.configuration?.vcpu !== undefined ||
			container.configuration?.memory_mib !== undefined
		) {
			// deprecated path to set a custom instance type
			// if an individual limit is not set, default to the dev instance type values
			instanceTypeOrLimits = {
				disk_bytes: (container.configuration?.disk?.size_mb ?? 2000) * MB, // defaults to 2GB in bytes
				vcpu: container.configuration?.vcpu ?? 0.0625,
				memory_mib: container.configuration?.memory_mib ?? 256,
			};
		} else if (
			typeof container.instance_type === "string" ||
			container.instance_type === undefined
		) {
			instanceTypeOrLimits = {
				instance_type: (container.instance_type ??
					InstanceType.LITE) as InstanceType,
			};
		} else {
			// set a custom instance type
			// any limits that are not set will default to a lite instance type
			instanceTypeOrLimits = {
				disk_bytes: (container.instance_type.disk_mb ?? 2000) * MB,
				vcpu: container.instance_type.vcpu ?? 0.0625,
				memory_mib: container.instance_type.memory_mib ?? 256,
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
				...instanceTypeOrLimits,
				dockerfile: container.image,
				image_build_context: imageBuildContext,
				image_vars: container.image_vars,
			});
		} else {
			normalizedContainers.push({
				...shared,
				...instanceTypeOrLimits,
				image_uri: args.dryRun
					? container.image
					: resolveImageName(await getAccountId(config), container.image), // if it is not a dockerfile, it must be an image uri or have thrown an error
			});
		}
	}

	return normalizedContainers;
};
