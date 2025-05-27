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
	memory_per_deployment: MemorySizeWithUnit;
	disk_per_deployment: DiskSizeWithUnit;
	total_vcpu: number;
	total_memory: MemorySizeWithUnit;
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
