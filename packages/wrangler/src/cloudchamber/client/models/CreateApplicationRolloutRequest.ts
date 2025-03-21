/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ModifyDeploymentV2RequestBody } from "./ModifyDeploymentV2RequestBody";
import type { RolloutStepRequest } from "./RolloutStepRequest";

/**
 * Request body to create a new rollout for an application.
 */
export type CreateApplicationRolloutRequest = {
	target_configuration: ModifyDeploymentV2RequestBody;
	/**
	 * Strategy used for the rollout. Currently supports only "rolling".
	 */
	strategy: CreateApplicationRolloutRequest.strategy;
	steps: Array<RolloutStepRequest>;
	/**
	 * Description of the rollout process.
	 */
	description: string;
};

export namespace CreateApplicationRolloutRequest {
	/**
	 * Strategy used for the rollout. Currently supports only "rolling".
	 */
	export enum strategy {
		ROLLING = "rolling",
	}
}
