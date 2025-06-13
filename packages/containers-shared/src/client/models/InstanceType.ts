/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The instance type will be used to configure vcpu, memory, and disk.
 *
 * - "dev": This will use a configuration of 1/16 vCPU, 256 MiB memory, and 2 GB disk
 * - "basic": This will use a configuration of 1/4 vCPU, 1 GiB memory, and 4 GB disk
 * - "standard": This will use a configuration of 1/2 vCPU, 4 GiB memory, and 4 GB disk
 *
 * The default is "dev".
 *
 */
export enum InstanceType {
	DEV = "dev",
	BASIC = "basic",
	STANDARD = "standard",
}
