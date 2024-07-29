/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentID } from "./DeploymentID";
import type { NodeName } from "./NodeName";

/**
 * Configuration of an IPAllocation
 */
export type IPAllocationConfiguration = {
	deploymentId?: DeploymentID;
	/**
	 * Node name that you want this IP to be sticky to
	 */
	nodeName?: NodeName;
};
