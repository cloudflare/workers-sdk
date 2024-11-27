/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DiskSizeWithUnit } from "./DiskSizeWithUnit";

/**
 * The disk configuration for this deployment. By default, all containers have a disk size of 2GB.
 */
export type Disk = {
	size: DiskSizeWithUnit;
};
