/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationID } from "./ApplicationID";
import type { DeploymentID } from "./DeploymentID";
import type { DeploymentLocation } from "./DeploymentLocation";
import type { DeploymentVersion } from "./DeploymentVersion";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { Network } from "./Network";
import type { NodeGroup } from "./NodeGroup";
import type { Placement } from "./Placement";
import type { Ref } from "./Ref";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * A Deployment represents an intent to run one or many containers, with the same image, in a particular location or region.
 */
export type DeploymentV2 = {
	id: DeploymentID;
	app_id?: ApplicationID;
	created_at: ISO8601Timestamp;
	account_id: AccountID;
	version: DeploymentVersion;
	image: Image;
	location: DeploymentLocation;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * Container environment variables
	 */
	environment_variables?: Array<EnvironmentVariable>;
	/**
	 * Deployment labels
	 */
	labels?: Array<Label>;
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
	network?: Network;
	/**
	 * The GPU memory of this deployment. If deployment is not node_group 'gpu', this will be null
	 */
	gpu_memory?: MemorySizeWithUnit;
};
