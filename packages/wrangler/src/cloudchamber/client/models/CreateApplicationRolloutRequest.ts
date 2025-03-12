/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ModifyUserDeploymentConfiguration } from "./ModifyUserDeploymentConfiguration";
import type { RolloutStepRequest } from "./RolloutStepRequest";

/**
 * Request body to create a new rollout for an application.
 */
export type CreateApplicationRolloutRequest = {
	target_configuration: ModifyUserDeploymentConfiguration;
	/**
	 * Strategy used for the rollout. Currently supports only "rolling".
	 */
	strategy: CreateApplicationRolloutRequest.strategy;
	/**
	 * Percentage of rollout to increase in each step when "steps" is not specificed. Applicable values are 5, 10, 20, 25, 50, 100.
	 * These create rollouts with 20, 10, 5, 4, 2, 1 steps respectively.
	 *
	 */
	step_percentage?: CreateApplicationRolloutRequest.step_percentage;
	/**
	 * Steps defining the rollout process, when "step_percentage" is not defined.
	 * Only one of "step_percentage" or "steps" can be defined when creating a rollout.
	 * "steps" allow granular control over each step.
	 *
	 */
	steps?: Array<RolloutStepRequest>;
	/**
	 * Description of the rollout process.
	 */
	description: string;
	/**
	 * Kind of the rollout process.
	 * - "full_auto": The default rollout mode, which starts progressing the steps upon rollout creation.
	 * - "full_manual": Requires manually progressing each step in the rollout using the UpdateRollout's action paramater.
	 *
	 */
	kind?: CreateApplicationRolloutRequest.kind;
};

export namespace CreateApplicationRolloutRequest {
	/**
	 * Strategy used for the rollout. Currently supports only "rolling".
	 */
	export enum strategy {
		ROLLING = "rolling",
	}

	/**
	 * Percentage of rollout to increase in each step when "steps" is not specificed. Applicable values are 5, 10, 20, 25, 50, 100.
	 * These create rollouts with 20, 10, 5, 4, 2, 1 steps respectively.
	 *
	 */
	export enum step_percentage {
		"_5" = 5,
		"_10" = 10,
		"_20" = 20,
		"_25" = 25,
		"_50" = 50,
		"_100" = 100,
	}

	/**
	 * Kind of the rollout process.
	 * - "full_auto": The default rollout mode, which starts progressing the steps upon rollout creation.
	 * - "full_manual": Requires manually progressing each step in the rollout using the UpdateRollout's action paramater.
	 *
	 */
	export enum kind {
		FULL_AUTO = "full_auto",
		FULL_MANUAL = "full_manual",
	}
}
