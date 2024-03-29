/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { DNSConfiguration } from "./DNSConfiguration";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { NetworkParameters } from "./NetworkParameters";
import type { Port } from "./Port";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * Request body for creating a new deployment
 */
export type CreateDeploymentV2RequestBody = {
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
	 * Deployment labels
	 */
	labels?: Array<Label>;
	network?: NetworkParameters;
	command?: Command;
	entrypoint?: Entrypoint;
	dns?: DNSConfiguration;
	ports?: Array<Port>;
};
