/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { DNSConfiguration } from "./DNSConfiguration";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { NetworkParameters } from "./NetworkParameters";
import type { Port } from "./Port";
import type { SecretMap } from "./SecretMap";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * Properties required to create a cloudchamber deployment specified by the user
 */
export type UserDeploymentConfiguration = {
	image: Image;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * A list of objects with secret names and the their access types from the account
	 */
	secrets?: Array<SecretMap>;
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
