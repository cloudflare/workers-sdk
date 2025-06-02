/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { LocationID } from "./LocationID";

/**
 * Configuration specified by the scheduler or user to create a deployment
 */
export type SchedulerDeploymentConfiguration = {
	location: LocationID;
};
