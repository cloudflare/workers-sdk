/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { IPAllocation } from "./IPAllocation";

/**
 * List of IPs with the filters that matched them
 */
export type IPAllocationsWithFilter = {
	ips: Array<IPAllocation>;
	filters: Record<string, any>;
};
