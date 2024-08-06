/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ApplicationID } from "../models/ApplicationID";
import type { ApplicationJob } from "../models/ApplicationJob";
import type { CreateApplicationJobRequest } from "../models/CreateApplicationJobRequest";
import type { JobID } from "../models/JobID";

export class JobsService {
	/**
	 * Create a new job within an application
	 * Returns the created job
	 * @param id
	 * @param requestBody
	 * @returns ApplicationJob A single job within an application
	 * @throws ApiError
	 */
	public static createApplicationJob(
		id: ApplicationID,
		requestBody: CreateApplicationJobRequest
	): CancelablePromise<ApplicationJob> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/applications/{id}/jobs",
			path: {
				id: id,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Can't create the application job because it has bad inputs`,
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Get an application job by application and job id
	 * Returns a single application job by id with its current status
	 * @param appId
	 * @param jobId
	 * @returns ApplicationJob A single application
	 * @throws ApiError
	 */
	public static getApplicationJob(
		appId: ApplicationID,
		jobId: JobID
	): CancelablePromise<ApplicationJob> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{appID}/jobs/{jobID}",
			path: {
				appID: appId,
				jobID: jobId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application/Job is not found`,
				500: `There has been an internal error`,
			},
		});
	}
}
