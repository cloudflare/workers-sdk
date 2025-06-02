/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { CreateSSHPublicKeyRequestBody } from "../models/CreateSSHPublicKeyRequestBody";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { ListSSHPublicKeys } from "../models/ListSSHPublicKeys";
import type { SSHPublicKeyItem } from "../models/SSHPublicKeyItem";

export class SshPublicKeysService {
	/**
	 * Add SSH public key
	 * Adds a new ssh public key to an account. This can then be associated with a specific deployment during its creation or modification.
	 * @param requestBody
	 * @returns SSHPublicKeyItem SSH Public key added successfully
	 * @throws ApiError
	 */
	public static createSshPublicKey(
		requestBody: CreateSSHPublicKeyRequestBody
	): CancelablePromise<SSHPublicKeyItem> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/ssh-public-keys",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				401: `Unauthorized`,
				500: `Create SSH Public key error`,
			},
		});
	}

	/**
	 * List SSH Public keys
	 * List all SSH Public keys in an account
	 * @returns ListSSHPublicKeys List SSH Public keys response
	 * @throws ApiError
	 */
	public static listSshPublicKeys(): CancelablePromise<ListSSHPublicKeys> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/ssh-public-keys",
			errors: {
				401: `Unauthorized`,
				500: `List SSH Public keys error`,
			},
		});
	}

	/**
	 * Delete SSH public key from the account
	 * Delete an SSH public key from an account.
	 * @param sshPublicKeyName
	 * @returns EmptyResponse SSH Public key was removed successfully
	 * @throws ApiError
	 */
	public static deleteSshPublicKey(
		sshPublicKeyName: string
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/ssh-public-keys/{sshPublicKeyName}",
			path: {
				sshPublicKeyName: sshPublicKeyName,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when the SSH public key that is trying to be found does not exist`,
				500: `There has been an internal error`,
			},
		});
	}
}
