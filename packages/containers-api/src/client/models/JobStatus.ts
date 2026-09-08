/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { JobStatusHealth } from "./JobStatusHealth";

export type JobStatus = {
	health: JobStatusHealth;
} & Record<string, any>;
