/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationAffinities } from "./ApplicationAffinities";
import type { ApplicationConstraints } from "./ApplicationConstraints";
import type { ApplicationPriorities } from "./ApplicationPriorities";
import type { ModifyUserDeploymentConfiguration } from "./ModifyUserDeploymentConfiguration";
import type { SchedulingPolicy } from "./SchedulingPolicy";

/**
 * Request body for modifying an application
 */
export type ModifyApplicationRequestBody = {
	/**
	 * The name for this application
	 */
	name?: string;
	/**
	 * Number of deployments to maintain within this applicaiton. This can be used to scale the appliation up/down.
	 */
	instances?: number;
	/**
	 * Maximum number of instances that the application will allow. This is relevant for applications that auto-scale.
	 * It will reduce the number of running instances if there are more than `max_instances`.
	 *
	 */
	max_instances?: number;
	affinities?: ApplicationAffinities;
	priorities?: ApplicationPriorities;
	scheduling_policy?: SchedulingPolicy;
	constraints?: ApplicationConstraints;
	/**
	 * The deployment configuration of all deployments created by this application.
	 * Right now, if you modify the application configuration, only new deployments
	 * created will have the new configuration. You can delete old deployments to
	 * release new instances.
	 *
	 */
	configuration?: ModifyUserDeploymentConfiguration;
};
