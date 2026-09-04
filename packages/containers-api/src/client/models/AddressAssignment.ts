/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentID } from "./DeploymentID";
import type { PlacementID } from "./PlacementID";
import type { UnixTimestamp } from "./UnixTimestamp";

/**
 * The allocation that exists when an IP or a port range has been assigned to a metal
 */
export type AddressAssignment = {
	placementID?: PlacementID;
	expiration?: UnixTimestamp;
	deploymentID?: DeploymentID;
};
