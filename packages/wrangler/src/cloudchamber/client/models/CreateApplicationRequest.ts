/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Create a new application object for dynamic scheduling
 */
export type CreateApplicationRequest = {
	/**
	 * The name for this application
	 */
	name: string;
	/**
	 * The image to be dynamically scheduled
	 */
	image: string;
	/**
	 * The scheduling policy to use
	 */
	scheduling_policy: string;
	/**
	 * Number of deployments to create
	 */
	instances: number;
};
