/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Request body for modifying an application
 */
export type ModifyApplicationRequestBody = {
	/**
	 * Number of deployments to maintain within this applicaiton. This can be used to scale the appliation up/down.
	 */
	instances: number;
};
