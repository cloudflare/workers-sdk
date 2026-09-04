/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Represents the 'status' of a Placement.
 * - placed: The Placement has been created on a node.
 * - stopping: The Placement is stopping.
 * - running: The Placement is running.
 * - failed: The Placement failed to run.
 * - stopped: The Placement stopped.
 * - unhealthy: The Placement has a failing healthcheck.
 *
 */
export enum PlacementStatusHealth {
	PLACED = "placed",
	STOPPING = "stopping",
	RUNNING = "running",
	FAILED = "failed",
	STOPPED = "stopped",
	UNHEALTHY = "unhealthy",
}
