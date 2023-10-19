/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationID } from "./ApplicationID";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * Describes multiple deployments with parameters that describe how they should be placed
 */
export type Application = {
	id: ApplicationID;
	created_at: ISO8601Timestamp;
	account_id: AccountID;
	/**
	 * The name for this application
	 */
	name: string;
	/**
	 * The image to be dynamically scheduled
	 */
	image: string;
	/**
	 * The scheduling policy to use
	 */
	scheduling_policy: string;
	/**
	 * Number of deployments to create
	 */
	instances: number;
};
