/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentQueuedDetails } from "./DeploymentQueuedDetails";
import type { DeploymentSchedulingState } from "./DeploymentSchedulingState";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";

export type DeploymentState = {
	current: DeploymentSchedulingState;
	last_updated: ISO8601Timestamp;
	queued_details?: DeploymentQueuedDetails;
};
