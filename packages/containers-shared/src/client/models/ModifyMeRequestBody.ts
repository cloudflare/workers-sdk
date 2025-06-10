/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Request body for modifying account defaults
 */
export type ModifyMeRequestBody = {
	defaults?: {
		/**
		 * Deprecated in favor of memory_mib
		 * @deprecated
		 */
		memory?: MemorySizeWithUnit;
		memory_mib?: number;
		vcpus?: number;
		disk_mb?: number;
	};
};
