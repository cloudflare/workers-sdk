/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { GenericMessageResponse } from "../models/GenericMessageResponse";
import type { ListSecretsMetadata } from "../models/ListSecretsMetadata";
import type { ModifySecretRequestBody } from "../models/ModifySecretRequestBody";
import type { Secret } from "../models/Secret";
import type { SecretMetadata } from "../models/SecretMetadata";

export class SecretsService {
	/**
	 * Add a new secret to the account
	 * Add a new secret to the account that can be associated with an application/deployment.
	 * @param requestBody
	 * @returns SecretMetadata Secret created successfully
	 * @throws ApiError
	 */
	public static createSecret(
		requestBody: Secret
	): CancelablePromise<SecretMetadata> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/secrets",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request`,
				409: `Secret with this name already exists in this account`,
				500: `Generic error response`,
			},
		});
	}

	/**
	 * List Secrets
	 * List all secrets in an account with metadata
	 * @returns ListSecretsMetadata List Secrets response
	 * @throws ApiError
	 */
	public static listSecrets(): CancelablePromise<ListSecretsMetadata> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/secrets",
			errors: {
				500: `Generic error response`,
			},
		});
	}

	/**
	 * Get secret metadata
	 * Get secret metadata by name
	 * @param secretName
	 * @returns SecretMetadata Get secret response
	 * @throws ApiError
	 */
	public static getSecret(
		secretName: string
	): CancelablePromise<SecretMetadata> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/secrets/{secretName}",
			path: {
				secretName: secretName,
			},
			errors: {
				404: `Secret not found error`,
				500: `Generic error response`,
			},
		});
	}

	/**
	 * Update an existing secret
	 * Update a secret within an account. This bumps its version field. Corresponding applications/deployments would get the updated secret in its next placement.
	 * @param secretName
	 * @param requestBody
	 * @returns SecretMetadata Modify Secrets response
	 * @throws ApiError
	 */
	public static modifySecret(
		secretName: string,
		requestBody: ModifySecretRequestBody
	): CancelablePromise<SecretMetadata> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/secrets/{secretName}",
			path: {
				secretName: secretName,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request`,
				404: `Secret not found error`,
				500: `Generic error response`,
			},
		});
	}

	/**
	 * Delete an existing secret
	 * Delete a secret within an account.
	 * @param secretName
	 * @returns GenericMessageResponse Generic OK response
	 * @throws ApiError
	 */
	public static deleteSecret(
		secretName: string
	): CancelablePromise<GenericMessageResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/secrets/{secretName}",
			path: {
				secretName: secretName,
			},
			errors: {
				404: `Secret not found error`,
				500: `Generic error response`,
			},
		});
	}
}
