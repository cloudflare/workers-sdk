/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentMutationError } from "./DeploymentMutationError";

export type CreateDeploymentBadRequest = {
	error: DeploymentMutationError;
	/**
	 * Details that might be filled depending on the error code.
	 */
	details?: Record<string, any>;
};
