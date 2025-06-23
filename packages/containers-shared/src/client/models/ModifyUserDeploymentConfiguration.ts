/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { DeploymentCheckRequestBody } from "./DeploymentCheckRequestBody";
import type { DeploymentSecretMap } from "./DeploymentSecretMap";
import type { Disk } from "./Disk";
import type { DNSConfiguration } from "./DNSConfiguration";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { InstanceType } from "./InstanceType";
import type { Label } from "./Label";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { NetworkParameters } from "./NetworkParameters";
import type { Observability } from "./Observability";
import type { Port } from "./Port";
import type { ProvisionerConfiguration } from "./ProvisionerConfiguration";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * Properties required to modify a cloudchamber deployment specified by the user.
 */
export type ModifyUserDeploymentConfiguration = {
	image?: Image;
	/**
	 * A list of SSH public key IDs from the account
	 */
	ssh_public_key_ids?: Array<SSHPublicKeyID>;
	/**
	 * A list of objects with secret names and the their access types from the account
	 */
	secrets?: Array<DeploymentSecretMap>;
	instance_type?: InstanceType;
	/**
	 * Specify the vcpu to be used for the deployment. Vcpu must be at least 0.0625. The input value will be rounded to
	 * the nearest 0.0001. The default will be the one configured for the account.
	 *
	 */
	vcpu?: number;
	/**
	 * Deprecated in favor of memory_mib
	 * @deprecated
	 */
	memory?: MemorySizeWithUnit;
	/**
	 * Specify the memory to be used for the deployment, in MiB. The default will be the one configured for the account.
	 */
	memory_mib?: number;
	/**
	 * The disk configuration for this deployment
	 */
	disk?: Disk;
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
	/**
	 * Health and readiness checks for this deployment.
	 */
	checks?: Array<DeploymentCheckRequestBody>;
	provisioner?: ProvisionerConfiguration;
	observability?: Observability;
};
