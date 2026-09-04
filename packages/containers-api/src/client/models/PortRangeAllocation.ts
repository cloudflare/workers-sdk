/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AddressAssignment } from "./AddressAssignment";

/**
 * Representation of a port range mapping in the Cloudchamber API.
 * No two port range for the same IP address can overlap.
 *
 */
export type PortRangeAllocation = {
	/**
	 * Starting port number of the port range. Inclusive
	 */
	start: number;
	/**
	 * Ending port number of the port range. Inclusive.
	 */
	end: number;
	allocation?: AddressAssignment;
};
