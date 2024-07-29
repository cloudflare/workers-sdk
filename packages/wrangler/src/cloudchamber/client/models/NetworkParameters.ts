/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AssignIPv4 } from "./AssignIPv4";
import type { AssignIPv6 } from "./AssignIPv6";

export type NetworkParameters = {
	/**
	 * Assign an IPv4 address to the deployment. One of 'none' (default), 'predefined' (allocate one from a set of IPv4 addresses in the global pool), 'account' (allocate one from a set of IPv4 addresses preassigned in the account pool).
	 *
	 */
	assign_ipv4?: AssignIPv4;
	/**
	 * Assign an IPv6 address to the deployment. One of 'predefined' (allocate one from a set of IPv6 addresses in the global pool), 'account' (allocate one from a set of IPv6 addresses preassigned in the account pool).
	 *
	 */
	assign_ipv6?: AssignIPv6;
};
