/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ModifyDeploymentV2RequestBody } from "./ModifyDeploymentV2RequestBody";

export type ApplicationSchedulingHint = {
	current: {
		instances: number;
		configuration: ModifyDeploymentV2RequestBody;
		version: number;
	};
	target: {
		instances: number;
		configuration: ModifyDeploymentV2RequestBody;
		version: number;
	};
};
