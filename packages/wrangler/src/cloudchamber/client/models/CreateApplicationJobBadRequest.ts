/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationMutationError } from "./ApplicationMutationError";

export type CreateApplicationJobBadRequest = {
	error: ApplicationMutationError;
	/**
	 * Details that might be filled depending on the error code.
	 */
	details?: Record<string, any>;
};
