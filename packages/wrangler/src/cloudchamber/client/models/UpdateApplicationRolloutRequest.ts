/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Request body to update a rollout within an application.
 */
export type UpdateApplicationRolloutRequest = {
	/**
	 * Action to perform on the rollout.
	 */
	action: UpdateApplicationRolloutRequest.action;
};

export namespace UpdateApplicationRolloutRequest {
	/**
	 * Action to perform on the rollout.
	 */
	export enum action {
		NEXT = "next",
		PREVIOUS = "previous",
		ROLLBACK = "rollback",
	}
}
