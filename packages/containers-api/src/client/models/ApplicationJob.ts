/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationID } from "./ApplicationID";
import type { Command } from "./Command";
import type { Disk } from "./Disk";
import type { DiskMB } from "./DiskMB";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { InstanceType } from "./InstanceType";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { JobEvents } from "./JobEvents";
import type { JobID } from "./JobID";
import type { JobStatus } from "./JobStatus";
import type { JobTimeoutSeconds } from "./JobTimeoutSeconds";
import type { MemorySizeWithUnit } from "./MemorySizeWithUnit";
import type { SecretMap } from "./SecretMap";

/**
 * An application job is a short-lived instance of an application
 */
export type ApplicationJob = {
	id: JobID;
	app_id: ApplicationID;
	created_at: ISO8601Timestamp;
	entrypoint: Entrypoint;
	command: Command;
	status: JobStatus;
	events: JobEvents;
	image: Image;
	instance_type?: InstanceType;
	/**
	 * Allocated vCPUs for this job
	 */
	vcpu: number;
	/**
	 * Allocated vCPUs for this job
	 */
	vcpus: number;
	/**
	 * Allocated memory for this job
	 */
	memory_mb: number;
	/**
	 * Deprecated in favor of memory_mib
	 * @deprecated
	 */
	memory: MemorySizeWithUnit;
	/**
	 * Specify the memory to be used for the deployment, in MiB. The default will be the one configured for the account.
	 */
	memory_mib?: number;
	/**
	 * The disk configuration for this job expressed in string
	 */
	disk?: Disk;
	/**
	 * The disk configuration for this job, expressed as a number (in MB)
	 */
	disk_mb?: DiskMB;
	/**
	 * Job specific environment variables
	 */
	environment_variables: Array<EnvironmentVariable>;
	/**
	 * Job specific secrets mapping
	 */
	secrets: Array<SecretMap>;
	timeout: JobTimeoutSeconds;
	/**
	 * The job's termination request status. This will be "false" by default. If the user requests a job termination, this will be set to true.
	 */
	terminate: boolean;
};
