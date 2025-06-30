/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Defines the kind of networking the container will have. If "public", the container will be assigned at least an IPv6, and an IPv4 if "assign_ipv4": true. If "public-by-port" is specified, the IP address assignment logic is the same as with "public". However, at least one port must be specified. Only packets sent to specified ports will be routed to the container. If "private", the container won't have any accessible public IPs, however it will be able to access the internet.
 *
 */
export enum ContainerNetworkMode {
	PUBLIC = "public",
	PUBLIC_BY_PORT = "public-by-port",
	PRIVATE = "private",
}
