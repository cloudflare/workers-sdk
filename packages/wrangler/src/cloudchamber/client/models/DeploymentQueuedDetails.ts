/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentQueuedReason } from "./DeploymentQueuedReason";

/**
 * Details on each property that might make the deployment stuck in the queue
 */
export type DeploymentQueuedDetails = {
	gpu?: DeploymentQueuedReason;
	cpu?: DeploymentQueuedReason;
	memory?: DeploymentQueuedReason;
	disk?: DeploymentQueuedReason;
	unknown?: DeploymentQueuedReason;
};
