/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { IP } from "./IP";
import type { IPAllocationConfiguration } from "./IPAllocationConfiguration";
import type { IPAllocationPlacement } from "./IPAllocationPlacement";

/**
 * An allocation of ips to a specific node
 */
export type IPAllocation = {
	configuration?: IPAllocationConfiguration;
	allocation?: IPAllocationPlacement;
	flexibleAllocation: boolean;
	/**
	 * the number that defines the ipv6 ID of this IP
	 */
	ipv6Counter?: number;
	/**
	 * the subnet mask that this IP belogns to
	 */
	subnetMask: number;
	ip: IP;
};
