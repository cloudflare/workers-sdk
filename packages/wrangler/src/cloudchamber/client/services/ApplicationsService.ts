/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { Application } from "../models/Application";
import type { ApplicationName } from "../models/ApplicationName";
import type { CreateApplicationRequest } from "../models/CreateApplicationRequest";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { Image } from "../models/Image";
import type { ListApplications } from "../models/ListApplications";

export class ApplicationsService {
	/**
	 * Create a new application
	 * Create a new application. An Application represents an intent to run one or more containers, with the same image, dynamically scheduled based on constraints
	 * @param requestBody
	 * @returns Application A newly created application
	 * @throws ApiError
	 */
	public static createApplication(
		requestBody: CreateApplicationRequest
	): CancelablePromise<Application> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/applications",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request that contains a specific constant code and details object about the error.`,
				401: `Unauthorized`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * List Applications associated with your account
	 * Lists all the applications that are associated with your account
	 * @param name Filter applications by name
	 * @param image Filter applications by image
	 * @param label Filter applications by label
	 * @returns ListApplications Get all application associated with your account
	 * @throws ApiError
	 */
	public static listApplications(
		name?: ApplicationName,
		image?: Image,
		label?: Array<string>
	): CancelablePromise<ListApplications> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications",
			query: {
				name: name,
				image: image,
				label: label,
			},
			errors: {
				401: `Unauthorized`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Get a single application by id
	 * Returns a single application by id
	 * @param id
	 * @returns Application A single application
	 * @throws ApiError
	 */
	public static getApplication(id: string): CancelablePromise<Application> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{id}",
			path: {
				id: id,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an account/location is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete a single application by id
	 * Deletes a single application by id
	 * @param id
	 * @returns EmptyResponse Delete application response
	 * @throws ApiError
	 */
	public static deleteApplication(
		id: string
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/applications/{id}",
			path: {
				id: id,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an account/location is not found`,
				500: `There has been an internal error`,
			},
		});
	}
}
