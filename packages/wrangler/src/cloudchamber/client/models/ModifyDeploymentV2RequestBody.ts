/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * Request body modifying an existing deployment
 */
export type ModifyDeploymentV2RequestBody = {
	/**
	 * The new image that the deployment will have from now on
	 */
	image?: string;
	/**
	 * The new location that the deployment will have from now on
	 */
	location?: string;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * The new vcpu that the deployment will have from now on
	 */
	vcpu?: number;
	/**
	 * The new memory that the deployment will have from now on
	 */
	memory?: MemorySizeWithUnit;
	/**
	 * Container environment variables
	 */
	environment_variables?: Array<EnvironmentVariable>;
	/**
	 * Deployment labels
	 */
	labels?: Array<Label>;
	/**
	 * Specify the GPU memory to be used for the deployment. (Mandatory for GPU deployments)
	 */
	gpu_memory?: MemorySizeWithUnit;
};
