/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Request body to update a rollout within an application.
 */
export type UpdateApplicationRolloutRequest = {
	/**
	 * Action to perform on the rollout.
	 * - next: The rollout will go forward one step. It will succeed if the current step is finished.
	 * - previous: The rollout will go back one step.
	 * - revert: The rollout goes back to the first step in one go.
	 *
	 */
	action: UpdateApplicationRolloutRequest.action;
};

export namespace UpdateApplicationRolloutRequest {
	/**
	 * Action to perform on the rollout.
	 * - next: The rollout will go forward one step. It will succeed if the current step is finished.
	 * - previous: The rollout will go back one step.
	 * - revert: The rollout goes back to the first step in one go.
	 *
	 */
	export enum action {
		NEXT = "next",
		PREVIOUS = "previous",
		REVERT = "revert",
	}
}
