/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationRolloutProgress } from "./ApplicationRolloutProgress";
import type { ModifyDeploymentV2RequestBody } from "./ModifyDeploymentV2RequestBody";
import type { RolloutID } from "./RolloutID";
import type { RolloutStep } from "./RolloutStep";

/**
 * Represents the status and metadata of a rollout process for an application.
 */
export type ApplicationRollout = {
	description: string;
	id: RolloutID;
	/**
	 * Kind of the rollout process.
	 * - "full": Default manual rollout to release to the entire application state.
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
	current_configuration: ModifyDeploymentV2RequestBody;
	target_configuration: ModifyDeploymentV2RequestBody;
	/**
	 * Current status of the rollout.
	 */
	status: ApplicationRollout.status;
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
	 * - "full": Default manual rollout to release to the entire application state.
	 * - "durable_objects_auto": Default when the application is a DO application.
	 *
	 */
	export enum kind {
		FULL = "full",
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
		IN_PROGRESS = "in-progress",
		COMPLETED = "completed",
		REVERTED = "reverted",
	}
}
