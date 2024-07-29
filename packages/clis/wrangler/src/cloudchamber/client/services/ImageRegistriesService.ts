/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { AccountRegistryToken } from "../models/AccountRegistryToken";
import type { CreateImageRegistryRequestBody } from "../models/CreateImageRegistryRequestBody";
import type { CustomerImageRegistry } from "../models/CustomerImageRegistry";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { ImageRegistryCredentialsConfiguration } from "../models/ImageRegistryCredentialsConfiguration";

export class ImageRegistriesService {
	/**
	 * Get a JWT to pull from the image registry
	 * Get a JWT to pull from the image registry specifying its domain
	 * @param domain
	 * @param requestBody
	 * @returns AccountRegistryToken Response that contains the credentials with 'pull' or 'push' permissions to access the registry
	 * @throws ApiError
	 */
	public static generateImageRegistryCredentials(
		domain: string,
		requestBody: ImageRegistryCredentialsConfiguration
	): CancelablePromise<AccountRegistryToken> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/registries/{domain}/credentials",
			path: {
				domain: domain,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request that contains a specific constant code and details object about the error.`,
				404: `The response body when the registry that is trying to be found does not exist`,
				409: `Response that contains the error ImageRegistryIsPublic`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete a registry from the account
	 * Delete a registry from the account, this will make Cloudchamber unable to pull images from the registry
	 * @param domain
	 * @returns EmptyResponse The image registry is deleted
	 * @throws ApiError
	 */
	public static deleteImageRegistry(
		domain: string
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/registries/{domain}",
			path: {
				domain: domain,
			},
			errors: {
				404: `The response body when the registry that is trying to be found does not exist`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Get the list of configured registries in the account
	 * Get the list of configured registries in the account
	 * @returns CustomerImageRegistry The list of registries that are added in the account
	 * @throws ApiError
	 */
	public static listImageRegistries(): CancelablePromise<
		Array<CustomerImageRegistry>
	> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/registries",
			errors: {
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Add a new image registry configuration
	 * Add a new image registry into your account, so then Cloudflare can pull docker images with public key JWT authentication
	 * @param requestBody
	 * @returns CustomerImageRegistry The response body when you create a new image registry in an account
	 * @throws ApiError
	 */
	public static createImageRegistry(
		requestBody: CreateImageRegistryRequestBody
	): CancelablePromise<CustomerImageRegistry> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/registries",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `The response body when the input to create a new image registry is malformed`,
				403: `The response body when the registry that is being added is not allowed`,
				409: `The response body when the image registry already exists in the account`,
				500: `There has been an internal error`,
			},
		});
	}
}
