/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Configuration for a VM provisioner.
 */
export type ProvisionerConfiguration = {
	/**
	 * The provisioner to use.
	 */
	type: ProvisionerConfiguration.type;
};

export namespace ProvisionerConfiguration {
	/**
	 * The provisioner to use.
	 */
	export enum type {
		NONE = "none",
		CLOUDINIT = "cloudinit",
	}
}
