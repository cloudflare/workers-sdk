/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationID } from "./ApplicationID";
import type { DeploymentID } from "./DeploymentID";
import type { DeploymentVersion } from "./DeploymentVersion";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { IPV4 } from "./IPV4";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { LocationID } from "./LocationID";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { NodeGroup } from "./NodeGroup";
import type { Placement } from "./Placement";
import type { Ref } from "./Ref";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * A Deployment represents an intent to run one or many containers, with the same image, in a particular location or region.
 */
export type Deployment = {
	id: DeploymentID;
	app_id?: ApplicationID;
	created_at: ISO8601Timestamp;
	account_id: AccountID;
	version: DeploymentVersion;
	image: Image;
	location: LocationID;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * Container environment variables
	 */
	environment_variables?: Array<EnvironmentVariable>;
	ipv4: IPV4;
	current_placement?: Placement;
	placements_ref: Ref;
	/**
	 * The vcpu of this deployment
	 */
	vcpu: number;
	/**
	 * The memory of this deployment
	 */
	memory: MemorySizeWithUnit;
	/**
	 * The node group of this deployment
	 */
	node_group: NodeGroup;
};
