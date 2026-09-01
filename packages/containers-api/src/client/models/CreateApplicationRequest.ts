/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationAffinities } from "./ApplicationAffinities";
import type { ApplicationConstraints } from "./ApplicationConstraints";
import type { ApplicationJobsConfig } from "./ApplicationJobsConfig";
import type { ApplicationPriorities } from "./ApplicationPriorities";
import type { ApplicationRolloutActiveGracePeriod } from "./ApplicationRolloutActiveGracePeriod";
import type { DurableObjectsConfiguration } from "./DurableObjectsConfiguration";
import type { SchedulingPolicy } from "./SchedulingPolicy";
import type { UserDeploymentConfiguration } from "./UserDeploymentConfiguration";

/**
 * Create a new application object for dynamic scheduling
 */
export type CreateApplicationRequest = {
	/**
	 * The name for this application
	 */
	name: string;
	scheduling_policy: SchedulingPolicy;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	/**
	 * Maximum number of instances that the application will allow. This is relevant for applications that auto-scale.
	 */
	max_instances?: number;
	constraints?: ApplicationConstraints;
	/**
	 * The deployment configuration of all deployments created by this application.
	 *
	 */
	configuration: UserDeploymentConfiguration;
	jobs?: ApplicationJobsConfig;
	/**
	 * If set, it will make the container application back a durable object namespace.
	 */
	durable_objects?: DurableObjectsConfiguration;
	affinities?: ApplicationAffinities;
	priorities?: ApplicationPriorities;
	rollout_active_grace_period?: ApplicationRolloutActiveGracePeriod;
};
