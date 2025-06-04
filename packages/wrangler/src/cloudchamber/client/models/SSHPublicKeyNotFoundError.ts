/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The ssh public key does not exist
 */
export type SSHPublicKeyNotFoundError = {
	error: SSHPublicKeyNotFoundError.error;
};

export namespace SSHPublicKeyNotFoundError {
	export enum error {
		SSH_PUBLIC_KEY_NOT_FOUND = "SSH_PUBLIC_KEY_NOT_FOUND",
	}
}
