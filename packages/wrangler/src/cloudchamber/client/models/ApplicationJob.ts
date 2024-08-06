/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { Entrypoint } from "./Entrypoint";
import type { EnvironmentVariable } from "./EnvironmentVariable";
import type { Image } from "./Image";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { JobEvents } from "./JobEvents";
import type { JobID } from "./JobID";
import type { JobStatus } from "./JobStatus";

/**
 * An application job is a short-lived instance of an application
 */
export type ApplicationJob = {
	id: JobID;
	created_at: ISO8601Timestamp;
	entrypoint: Entrypoint;
	command: Command;
	status: JobStatus;
	events: JobEvents;
	image: Image;
	/**
	 * Allocated vCPUs for this job
	 */
	vcpus: number;
	/**
	 * Allocated memory for this job
	 */
	memory_mb: number;
	/**
	 * Job specific environment variables
	 */
	environment_variables: Array<EnvironmentVariable>;
};
