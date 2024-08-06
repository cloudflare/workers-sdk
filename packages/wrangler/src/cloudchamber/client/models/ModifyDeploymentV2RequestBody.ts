/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { DNSConfiguration } from "./DNSConfiguration";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { SecretMap } from "./SecretMap";
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
	 * A list of objects with secret names and the their access types from the account
	 */
	secrets?: Array<SecretMap>;
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
	command?: Command;
	entrypoint?: Entrypoint;
	dns?: DNSConfiguration;
};
