/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AssignIPv4 } from "./AssignIPv4";

export type NetworkParameters = {
	/**
	 * Assign an IPv4 address to the deployment. One of 'none' (default), 'predefined' (allocate one from a set of IPv4 addresses assigned to the account).
	 *
	 */
	assign_ipv4?: AssignIPv4;
};
