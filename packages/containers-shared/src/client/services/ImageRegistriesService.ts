/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { AccountRegistryToken } from "../models/AccountRegistryToken";
import type { CreateImageRegistryRequestBody } from "../models/CreateImageRegistryRequestBody";
import type { CustomerImageRegistry } from "../models/CustomerImageRegistry";
import type { DeleteImageRegistryResponse } from "../models/DeleteImageRegistryResponse";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { ImageRegistryCredentialsConfiguration } from "../models/ImageRegistryCredentialsConfiguration";
import type { ImageRegistryProtocol } from "../models/ImageRegistryProtocol";
import type { ImageRegistryProtocols } from "../models/ImageRegistryProtocols";

export class ImageRegistriesService {
	/**
	 * Create an image registry protocol that resolves to multiple domains.
	 * @param requestBody
	 * @returns ImageRegistryProtocol The image registry protocol was created
	 * @throws ApiError
	 */
	public static createImageRegistryProtocol(
		requestBody: ImageRegistryProtocol
	): CancelablePromise<ImageRegistryProtocol> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/registries/protos",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request that contains a specific constant code and details object about the error.`,
				403: `The registry that is being added is not allowed`,
				409: `Image registry protocol already exists`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * List all image registry protocols.
	 * @returns ImageRegistryProtocols The image registry protocols in the account
	 * @throws ApiError
	 */
	public static listImageRegistryProtocols(): CancelablePromise<ImageRegistryProtocols> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/registries/protos",
			errors: {
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Modify an image registry protocol. The previous list of domains will be replaced by the ones you specify in this endpoint.
	 * @param requestBody
	 * @returns ImageRegistryProtocol The image registry protocol was modified
	 * @throws ApiError
	 */
	public static modifyImageRegistryProtocol(
		requestBody: ImageRegistryProtocol
	): CancelablePromise<ImageRegistryProtocol> {
		return __request(OpenAPI, {
			method: "PUT",
			url: "/registries/protos",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request that contains a specific constant code and details object about the error.`,
				403: `The registry that is being added is not allowed`,
				404: `Image registry protocol doesn't exist`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete an image registry protocol. Be careful, if there is deployments running referencing this protocol they won't be able to pull the image.
	 * @param proto
	 * @returns EmptyResponse Image registry protocol was deleted successfully
	 * @throws ApiError
	 */
	public static deleteImageRegistryProto(
		proto: string
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/registries/protos/{proto}",
			path: {
				proto: proto,
			},
			errors: {
				400: `The image registry protocol couldn't be deleted because it's referenced by a deployment or application`,
				404: `Image registry protocol doesn't exist`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Get a JWT to pull from the image registry
	 * Get a JWT to pull from the image registry specifying its domain
	 * @param domain
	 * @param requestBody
	 * @returns AccountRegistryToken Credentials with 'pull' or 'push' permissions to access the registry
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
				404: `The image registry does not exist`,
				409: `The registry was configured as public, so credentials can not be generated`,
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
	): CancelablePromise<DeleteImageRegistryResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/registries/{domain}",
			path: {
				domain: domain,
			},
			errors: {
				404: `The image registry does not exist`,
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
	 * @returns CustomerImageRegistry Created a new image registry in the account
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
				400: `Image registry input is malformed, see the error details`,
				403: `The registry that is being added is not allowed`,
				409: `The image registry already exists in the account`,
				500: `There has been an internal error`,
			},
		});
	}
}
