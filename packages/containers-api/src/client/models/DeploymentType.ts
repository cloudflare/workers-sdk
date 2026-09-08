/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The type of deployment that determines how the deployment executes.
 *
 * - "default": Means that the deployment is long-running and will always maintain
 * a single placement (aka container) running at the same time.
 * It's the classic and default definition of a deployment in Cloudchamber.
 * - "jobs": Means that the deployment will subscribe itself to a durable object control plane
 * that receives jobs to run. It will prewarm a deployment in a metal to receive jobs
 * and run them immediately.
 * - "durable_object": Means that the deployment will back a single durable object instance.
 * It's similar to jobs in the sense that the user decides when the container starts and ends.
 *
 * The default is long-running deployments with "default".
 *
 */
export enum DeploymentType {
	DEFAULT = "default",
	JOBS = "jobs",
	DURABLE_OBJECT = "durable_object",
}
