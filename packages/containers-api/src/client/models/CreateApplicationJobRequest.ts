/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { InstanceType } from "./InstanceType";
import type { JobSecretMap } from "./JobSecretMap";
import type { JobTimeoutSeconds } from "./JobTimeoutSeconds";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";

/**
 * Create a new application Job request body
 */
export type CreateApplicationJobRequest = {
	entrypoint: Entrypoint;
	command: Command;
	image?: Image;
	timeout?: JobTimeoutSeconds;
	instance_type?: InstanceType;
	/**
	 * Allocate vCPUs for this job. Vcpu must be at least 0.0625. The input value will be rounded to the nearest 0.0001. It
	 * defaults to the application configuration's vCPUs setting, and if that is not specified, it uses the account defaults.
	 *
	 */
	vcpus?: number;
	/**
	 * Allocate vCPUs for this job. Vcpu must be at least 0.0625. The input value will be rounded to the nearest 0.0001. It
	 * defaults to the application configuration's "vCPU" setting, and if that is not specified, it uses the account defaults.
	 *
	 */
	vcpu?: number;
	/**
	 * Deprecated in favor of memory_mib
	 * @deprecated
	 */
	memory?: MemorySizeWithUnit;
	/**
	 * Amount of memory to allocate for this job, in MiB. It defaults to the application configuration's memory setting,
	 * and if that is not specified, it uses the account defaults.
	 *
	 */
	memory_mib?: number;
	/**
	 * Set job specific environment vars. If an env var already exists in the application configuration it would be overriden.
	 */
	environment_variables?: Array<EnvironmentVariable>;
	/**
	 * Set job specific secrets.
	 */
	secrets?: Array<JobSecretMap>;
};
