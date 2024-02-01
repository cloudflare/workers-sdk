/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationID } from "./ApplicationID";
import type { ApplicationName } from "./ApplicationName";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { Label } from "./Label";
import type { NetworkParameters } from "./NetworkParameters";

/**
 * Describes multiple deployments with parameters that describe how they should be placed
 */
export type Application = {
	id: ApplicationID;
	created_at: ISO8601Timestamp;
	account_id: AccountID;
	name: ApplicationName;
	/**
	 * The image to be dynamically scheduled
	 */
	image: string;
	network?: NetworkParameters;
	/**
	 * The scheduling policy to use
	 */
	scheduling_policy: string;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	/**
	 * Deployment labels
	 */
	labels?: Array<Label>;
};
