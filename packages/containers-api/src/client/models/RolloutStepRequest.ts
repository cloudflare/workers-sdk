/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Steps defining the rollout process.
 */
export type RolloutStepRequest = {
	step_size: {
		/**
		 * Percentage of instances affected in this step. Min 10% and Max 100%.
		 */
		percentage: number;
	};
	/**
	 * Description of the rollout step.
	 */
	description: string;
};
