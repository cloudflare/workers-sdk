/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentID } from "./DeploymentID";
import type { PlacementID } from "./PlacementID";
import type { UnixTimestamp } from "./UnixTimestamp";

/**
 * The allocation that exists when an IP has been assigned to a metal
 */
export type IPAllocationPlacement = {
	placementID?: PlacementID;
	expiration: UnixTimestamp;
	deploymentID?: DeploymentID;
};
