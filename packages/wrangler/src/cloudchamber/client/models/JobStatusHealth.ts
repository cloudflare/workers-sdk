/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Job status health represents the job's health. It can be in one of the following states
 * Queued    - The job has been created and is waiting to be scheduled.
 * Scheduled - The job has been scheduled on a designated compute instance.
 * Placed    - The job has been placed on a compute node and its relevant resources like images, networking and bind mounts are being prepared.
 * Running   - The job has started running the container with the given job configuration.
 * Stopped   - The job has stopped running
 *
 */
export enum JobStatusHealth {
	QUEUED = "Queued",
	SCHEDULED = "Scheduled",
	PLACED = "Placed",
	RUNNING = "Running",
	STOPPED = "Stopped",
}
