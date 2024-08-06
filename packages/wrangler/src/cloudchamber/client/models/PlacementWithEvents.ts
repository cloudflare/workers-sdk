/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentID } from "./DeploymentID";
import type { DeploymentVersion } from "./DeploymentVersion";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { PlacementEvents } from "./PlacementEvents";
import type { PlacementID } from "./PlacementID";
import type { PlacementStatus } from "./PlacementStatus";

/**
 * A Placement represents the lifetime of a single instance of a Deployment. This represents a specific placement along with its events.
 */
export type PlacementWithEvents = {
	id: PlacementID;
	created_at: ISO8601Timestamp;
	deployment_id: DeploymentID;
	deployment_version: DeploymentVersion;
	terminate: boolean;
	status: PlacementStatus;
	events: PlacementEvents;
	last_update?: ISO8601Timestamp;
};
