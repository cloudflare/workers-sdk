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
		 * @deprecated
		 */
		memory?: MemorySizeWithUnit;
		memory_mib?: number;
		vcpus?: number;
	};
};
