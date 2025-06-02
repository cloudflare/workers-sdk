/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Response when the deployment that is backing the resource is not found.
 *
 */
export type DeploymentNotFoundError = {
	error: DeploymentNotFoundError.error;
};

export namespace DeploymentNotFoundError {
	export enum error {
		DEPLOYMENT_NOT_FOUND = "DEPLOYMENT_NOT_FOUND",
	}
}
