/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Represents the limits related to a location
 */
export type AccountLocationLimits = {
	vcpu_per_deployment: number;
	memory_per_deployment: MemorySizeWithUnit;
	total_vcpu: number;
	total_memory: MemorySizeWithUnit;
};
