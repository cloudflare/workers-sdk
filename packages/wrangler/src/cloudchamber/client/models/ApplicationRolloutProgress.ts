/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Progress details of an application rollout.
 */
export type ApplicationRolloutProgress = {
	/**
	 * Total number of steps in the rollout.
	 */
	total_steps: number;
	/**
	 * Current step being executed in the rollout process. Initialized to 0.
	 */
	current_step: number;
	/**
	 * Number of instances updated in the rollout process.
	 */
	updated_instances: number;
	/**
	 * Total number of instances affected by the rollout.
	 */
	total_instances: number;
};
