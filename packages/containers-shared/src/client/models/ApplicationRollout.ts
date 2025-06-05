/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationHealth } from "./ApplicationHealth";
import type { ApplicationRolloutProgress } from "./ApplicationRolloutProgress";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { ModifyUserDeploymentConfiguration } from "./ModifyUserDeploymentConfiguration";
import type { RolloutID } from "./RolloutID";
import type { RolloutStep } from "./RolloutStep";

/**
 * Represents the status and metadata of a rollout process for an application.
 */
export type ApplicationRollout = {
	description: string;
	id: RolloutID;
	created_at: ISO8601Timestamp;
	/**
	 * Timestamp of the most recent update to status, health, or progress
	 */
	last_updated_at: ISO8601Timestamp;
	/**
	 * Kind of the rollout process.
	 * - "full_auto": The default rollout mode, which starts progressing the steps upon rollout creation.
	 * - "full_manual": Requires manually progressing each step in the rollout using the UpdateRollout's action paramater.
	 * - "durable_objects_auto": Default when the application is a DO application.
	 *
	 */
	kind: ApplicationRollout.kind;
	/**
	 * The rollout strategy
	 */
	strategy: ApplicationRollout.strategy;
	/**
	 * Current application version before the rollout.
	 */
	current_version: number;
	/**
	 * Target application version after the rollout is complete and applied to all current instances.
	 */
	target_version: number;
	current_configuration: ModifyUserDeploymentConfiguration;
	target_configuration: ModifyUserDeploymentConfiguration;
	/**
	 * Current status of the rollout.
	 */
	status: ApplicationRollout.status;
	health: ApplicationHealth;
	steps: Array<RolloutStep>;
	progress: ApplicationRolloutProgress;
	/**
	 * Timestamp when the rollout started.
	 */
	started_at?: string;
};

export namespace ApplicationRollout {
	/**
	 * Kind of the rollout process.
	 * - "full_auto": The default rollout mode, which starts progressing the steps upon rollout creation.
	 * - "full_manual": Requires manually progressing each step in the rollout using the UpdateRollout's action paramater.
	 * - "durable_objects_auto": Default when the application is a DO application.
	 *
	 */
	export enum kind {
		FULL_AUTO = "full_auto",
		FULL_MANUAL = "full_manual",
		DURABLE_OBJECTS_AUTO = "durable_objects_auto",
	}

	/**
	 * The rollout strategy
	 */
	export enum strategy {
		ROLLING = "rolling",
	}

	/**
	 * Current status of the rollout.
	 */
	export enum status {
		PENDING = "pending",
		PROGRESSING = "progressing",
		COMPLETED = "completed",
		REVERTED = "reverted",
		REPLACED = "replaced",
	}
}
