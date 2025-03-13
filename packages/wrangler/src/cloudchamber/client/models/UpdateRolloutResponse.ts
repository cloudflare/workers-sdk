/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationRollout } from "./ApplicationRollout";

/**
 * Response body when updating a rollout with a specific action.
 */
export type UpdateRolloutResponse = {
	/**
	 * Denotes whether the rollout action was successful
	 */
	success: boolean;
	/**
	 * Details of the rollout action. Includes the reason if this rollout action is not successful.
	 */
	message: string;
	rollout: ApplicationRollout;
};
