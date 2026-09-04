/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ContainerNetworkMode } from "./ContainerNetworkMode";
import type { IPV4 } from "./IPV4";

/**
 * Network properties
 */
export type Network = {
	mode: ContainerNetworkMode;
	ipv4?: IPV4;
	ipv6?: string;
};
