/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The instance type will be used to configure vcpu, memory, and disk.
 *
 * - "lite": This will use a configuration of 1/16 vCPU, 256 MiB memory, and 2 GB disk
 * - "basic": This will use a configuration of 1/4 vCPU, 1 GiB memory, and 4 GB disk
 * - "standard-1": This will use a configuration of 1/2 vCPU, 4 GiB memory, and 8 GB disk
 * - "standard-2": This will use a configuration of 1 vCPU, 6 GiB memory, and 12 GB disk
 * - "standard-3": This will use a configuration of 2 vCPU, 8 GiB memory, and 16 GB disk
 * - "standard-4": This will use a configuration of 4 vCPU, 12 GiB memory, and 20 GB disk
 * - "standard": This will use a configuration of 1/2 vCPU, 4 GiB memory, and 4 GB disk. Now deprecated.
 * - "dev": Is an alias for "lite". Now deprecated.
 *
 * The default is "lite".
 *
 */
export enum InstanceType {
	LITE = "lite",
	DEV = "dev",
	BASIC = "basic",
	STANDARD = "standard",
	STANDARD_1 = "standard-1",
	STANDARD_2 = "standard-2",
	STANDARD_3 = "standard-3",
	STANDARD_4 = "standard-4",
}
