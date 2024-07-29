/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { DeploymentID } from "./DeploymentID";

/**
 * Configuration of an IP.
 */
export type IPAllocationConfiguration = {
	/**
	 * Will be filled when a created deployment is assigned to this IP.
	 */
	deploymentId?: DeploymentID;
	/**
	 * Will be filled when Cloudchamber assigns this IP to a specific account pool.
	 */
	accountId?: AccountID;
};
