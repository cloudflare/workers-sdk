/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * Steps within the rollout process.
 */
export type RolloutStep = {
	/**
	 * The sequential order of the rollout step, automatically assigned starting from 1, based on the total number of steps in the rollout process.
	 */
	id: number;
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
	/**
	 * Status of the rollout step.
	 */
	status: RolloutStep.status;
	/**
	 * Reason why the step has the current status
	 */
	reason?: string;
	started_at?: ISO8601Timestamp;
	completed_at?: ISO8601Timestamp;
};

export namespace RolloutStep {
	/**
	 * Status of the rollout step.
	 */
	export enum status {
		PENDING = "pending",
		PROGRESSING = "progressing",
		REVERTING = "reverting",
		COMPLETED = "completed",
		REVERTED = "reverted",
	}
}
