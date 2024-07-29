/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SchedulerDeploymentConfiguration } from "./SchedulerDeploymentConfiguration";
import type { UserDeploymentConfiguration } from "./UserDeploymentConfiguration";

/**
 * Request body for creating a new deployment
 */
export type CreateDeploymentV2RequestBody = UserDeploymentConfiguration &
	SchedulerDeploymentConfiguration;
