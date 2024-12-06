/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationAffinities } from "./ApplicationAffinities";
import type { ApplicationConstraints } from "./ApplicationConstraints";
import type { SchedulingPolicy } from "./SchedulingPolicy";
import type { UserDeploymentConfiguration } from "./UserDeploymentConfiguration";

/**
 * Request body for modifying an application
 */
export type ModifyApplicationRequestBody = {
	/**
	 * Number of deployments to maintain within this applicaiton. This can be used to scale the appliation up/down.
	 */
	instances?: number;
	affinities?: ApplicationAffinities;
	scheduling_policy?: SchedulingPolicy;
	constraints?: ApplicationConstraints;
	/**
	 * The deployment configuration of all deployments created by this application.
	 * Right now, if you modify the application configuration, only new deployments
	 * created will have the new configuration. You can delete old deployments to
	 * release new instances.
	 *
	 */
	configuration?: UserDeploymentConfiguration;
};
