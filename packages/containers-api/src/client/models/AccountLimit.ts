/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { DiskSizeWithUnit } from "./DiskSizeWithUnit";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { NetworkMode } from "./NetworkMode";
import type { NodeGroup } from "./NodeGroup";

/**
 * Represents a Cloudchamber account limit
 */
export type AccountLimit = {
	account_id: AccountID;
	vcpu_per_deployment: number;
	/**
	 * Deprecated in favor of memory_mib_per_deployment
	 * @deprecated
	 */
	memory_per_deployment: MemorySizeWithUnit;
	memory_mib_per_deployment: number;
	/**
	 * Deprecated in favor of disk_mb_per_deployment
	 * @deprecated
	 */
	disk_per_deployment: DiskSizeWithUnit;
	disk_mb_per_deployment: number;
	total_vcpu: number;
	/**
	 * Deprecated in favor of total_memory_mib
	 * @deprecated
	 */
	total_memory: MemorySizeWithUnit;
	total_memory_mib: number;
	/**
	 * Total amount of disk usage allowed for the account
	 */
	total_disk_mb: number;
	node_group: NodeGroup;
	/**
	 * Network modes that will be included in this customer's vm
	 */
	network_modes: Array<NetworkMode>;
	/**
	 * Number of ipv4s available to the account
	 */
	ipv4s: number;
};
