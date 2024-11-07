/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentID } from "./DeploymentID";
import type { DeploymentVersion } from "./DeploymentVersion";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { PlacementID } from "./PlacementID";
import type { PlacementStatus } from "./PlacementStatus";

/**
 * A Placement represents the lifetime of a single instance of a Deployment. Whereas a Deployment represents your intent to run one or many containers, a Placement represents these containers actually running. Every time you create or update a Deployment, a new Placement is created.
 */
export type Placement = {
	id: PlacementID;
	created_at: ISO8601Timestamp;
	deployment_id: DeploymentID;
	deployment_version: DeploymentVersion;
	terminate: boolean;
	status: PlacementStatus;
	last_update?: ISO8601Timestamp;
};
