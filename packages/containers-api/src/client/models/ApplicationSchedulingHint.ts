/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ModifyUserDeploymentConfiguration } from "./ModifyUserDeploymentConfiguration";

export type ApplicationSchedulingHint = {
	current: {
		instances: number;
		configuration: ModifyUserDeploymentConfiguration;
		version: number;
	};
	target: {
		instances: number;
		configuration: ModifyUserDeploymentConfiguration;
		version: number;
	};
};
