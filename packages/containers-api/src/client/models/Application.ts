/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { ApplicationAffinities } from "./ApplicationAffinities";
import type { ApplicationConstraints } from "./ApplicationConstraints";
import type { ApplicationHealth } from "./ApplicationHealth";
import type { ApplicationID } from "./ApplicationID";
import type { ApplicationJobsConfig } from "./ApplicationJobsConfig";
import type { ApplicationName } from "./ApplicationName";
import type { ApplicationPriorities } from "./ApplicationPriorities";
import type { ApplicationRolloutActiveGracePeriod } from "./ApplicationRolloutActiveGracePeriod";
import type { ApplicationSchedulingHint } from "./ApplicationSchedulingHint";
import type { DurableObjectsConfiguration } from "./DurableObjectsConfiguration";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { RolloutID } from "./RolloutID";
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
	version: number;
	scheduling_policy: SchedulingPolicy;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	/**
	 * Maximum number of instances that the application will allow. This is relevant for applications that auto-scale.
	 */
	max_instances?: number;
	configuration: UserDeploymentConfiguration;
	constraints?: ApplicationConstraints;
	jobs?: ApplicationJobsConfig;
	affinities?: ApplicationAffinities;
	priorities?: ApplicationPriorities;
	durable_objects?: DurableObjectsConfiguration;
	scheduling_hint?: ApplicationSchedulingHint;
	active_rollout_id?: RolloutID;
	rollout_active_grace_period?: ApplicationRolloutActiveGracePeriod;
	health?: ApplicationHealth;
};
