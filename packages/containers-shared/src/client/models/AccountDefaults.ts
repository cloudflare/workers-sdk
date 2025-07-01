/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Represents the default configuration for an account
 */
export type AccountDefaults = {
	vcpus: number;
	memory_mib: number;
	/**
	 * Default disk size in MB
	 */
	disk_mb?: number;
	/**
	 * Deprecated in favor of memory_mib
	 * @deprecated
	 */
	memory?: MemorySizeWithUnit;
};
