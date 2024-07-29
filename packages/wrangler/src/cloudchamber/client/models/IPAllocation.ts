/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { IP } from "./IP";
import type { IPAllocationConfiguration } from "./IPAllocationConfiguration";
import type { IPAllocationPlacement } from "./IPAllocationPlacement";
import type { IPType } from "./IPType";

/**
 * Representation of an IP mapping in the Cloudchamber API. Contains all the necessary information to see if this IP belongs to a deployment or account IP pool, and if it's allocated.
 */
export type IPAllocation = {
	/**
	 * If not assigned to a deployment, or not belonging to a pool, will be undefined.
	 */
	configuration?: IPAllocationConfiguration;
	/**
	 * If not allocated, this will be undefined.
	 */
	allocation?: IPAllocationPlacement;
	/**
	 * the subnet mask that this IP belongs to
	 */
	subnetMask: number;
	ip: IP;
	ipType?: IPType;
};
