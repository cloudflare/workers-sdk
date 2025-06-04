/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { GenericErrorDetails } from "./GenericErrorDetails";

/**
 * The secret name already exists
 */
export type SecretNameAlreadyExists = {
	/**
	 * The secret name already exists in this account
	 */
	error: SecretNameAlreadyExists.error;
	details?: GenericErrorDetails;
};

export namespace SecretNameAlreadyExists {
	/**
	 * The secret name already exists in this account
	 */
	export enum error {
		SECRET_NAME_ALREADY_EXISTS = "SECRET_NAME_ALREADY_EXISTS",
	}
}
