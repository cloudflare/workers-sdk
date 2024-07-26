/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Represents the default configuration for an account
 */
export type AccountDefaults = {
	vcpus: number;
	memory: MemorySizeWithUnit;
};
