/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Represents the limits related to a location
 */
export type AccountLocationLimits = {
	vcpu_per_deployment: number;
	/**
	 * Deprecated in favor of memory_mib_per_deployment
	 * @deprecated
	 */
	memory_per_deployment: MemorySizeWithUnit;
	memory_mib_per_deployment?: number;
	total_vcpu: number;
	/**
	 * Deprecated in favor of total_memory_mib
	 * @deprecated
	 */
	total_memory: MemorySizeWithUnit;
	total_memory_mib?: number;
};
