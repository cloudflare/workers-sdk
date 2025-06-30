/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DiskSizeWithUnit } from "./DiskSizeWithUnit";

/**
 * The disk configuration for this deployment. By default, all containers have a disk size of 2GB.
 */
export type Disk = {
	/**
	 * Deprecated in favor of size_mb.
	 * @deprecated
	 */
	size?: DiskSizeWithUnit;
	/**
	 * Size of the disk, in MB.
	 */
	size_mb?: number;
};
