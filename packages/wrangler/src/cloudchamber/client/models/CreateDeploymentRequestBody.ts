/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * Request body creating a new deployment
 */
export type CreateDeploymentRequestBody = {
	/**
	 * Image you want for creating a deployment
	 */
	image: string;
	/**
	 * Where do you want your deployment to live
	 */
	location: string;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * Specify the vcpu to be used for the deployment. The default will be the one configured for the account.
	 */
	vcpu?: number;
	/**
	 * Specify the memory to be used for the deployment. The default will be the one configured for the account.
	 */
	memory?: MemorySizeWithUnit;
	/**
	 * Container environment variables
	 */
	environment_variables?: Array<EnvironmentVariable>;
	/**
	 * Specify the GPU memory to be used for the deployment. (Mandatory for gVisor deployments)
	 */
	gpu_memory?: MemorySizeWithUnit;
};
