/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The secret name does not exist
 */
export type SecretNotFound = {
	error: SecretNotFound.error;
};

export namespace SecretNotFound {
	export enum error {
		SECRET_NAME_NOT_FOUND = "SECRET_NAME_NOT_FOUND",
	}
}
