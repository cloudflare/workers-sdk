/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationAffinities } from "./ApplicationAffinities";
import type { ApplicationConstraints } from "./ApplicationConstraints";
import type { ApplicationID } from "./ApplicationID";
import type { ApplicationJobsConfig } from "./ApplicationJobsConfig";
import type { ApplicationName } from "./ApplicationName";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { SchedulingPolicy } from "./SchedulingPolicy";
import type { UserDeploymentConfiguration } from "./UserDeploymentConfiguration";

/**
 * Describes multiple deployments with parameters that describe how they should be placed
 */
export type Application = {
	id: ApplicationID;
	created_at: ISO8601Timestamp;
	account_id: AccountID;
	name: ApplicationName;
	scheduling_policy: SchedulingPolicy;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	configuration: UserDeploymentConfiguration;
	constraints?: ApplicationConstraints;
	jobs?: ApplicationJobsConfig;
	affinities?: ApplicationAffinities;
};
