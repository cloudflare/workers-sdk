/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Command } from "./Command";
import type { Entrypoint } from "./Entrypoint";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { JobID } from "./JobID";

/**
 * An application job is a short-lived instance of an application
 */
export type ApplicationJob = {
	id: JobID;
	created_at: ISO8601Timestamp;
	entrypoint: Entrypoint;
	command: Command;
};
