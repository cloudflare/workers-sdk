/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Defines the kind of networking the container will have. If "public", the container will be assigned atleast an IPv6, and an IPv4 if "assign_ipv4": true. If "private", the container won't have any accessible public IPs, however it will be able to access the internet.
 *
 */
export enum ContainerNetworkMode {
	PUBLIC = "public",
	PRIVATE = "private",
}
