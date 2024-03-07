/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Underlying runtime that will run the container. Each runtime has different characteristics.
 * 'firecracker' is the default one and the recommended to use. At the moment, it's the only one that allows INGRESS internet connection to the container and have a public IPv4/IPv6.
 * 'gvisor' is opt-in, at the moment it's the only one that allows GPU access in the container.
 * This field can only be chosen on deployment creation.
 *
 */
export enum Runtime {
	FIRECRACKER = "firecracker",
	GVISOR = "gvisor",
}
