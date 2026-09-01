/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ApplicationID } from "../models/ApplicationID";
import type { ApplicationJob } from "../models/ApplicationJob";
import type { ApplicationStatus } from "../models/ApplicationStatus";
import type { CreateApplicationJobRequest } from "../models/CreateApplicationJobRequest";
import type { GenericMessageResponse } from "../models/GenericMessageResponse";
import type { JobID } from "../models/JobID";
import type { ModifyApplicationJobRequest } from "../models/ModifyApplicationJobRequest";

export class JobsService {
	/**
	 * Application queue status
	 * Get an application's queue status. Only works under an application with type jobs.
	 * @param applicationId
	 * @returns ApplicationStatus Application status with details about the job queue, instances and other metadata for introspection.
	 * @throws ApiError
	 */
	public static getApplicationStatus(
		applicationId: ApplicationID
	): CancelablePromise<ApplicationStatus> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}/status",
			path: {
				application_id: applicationId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Create a new job within an application
	 * Returns the created job
	 * @param applicationId
	 * @param requestBody
	 * @returns ApplicationJob A single job within an application
	 * @throws ApiError
	 */
	public static createApplicationJob(
		applicationId: ApplicationID,
		requestBody: CreateApplicationJobRequest
	): CancelablePromise<ApplicationJob> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/applications/{application_id}/jobs",
			path: {
				application_id: applicationId,
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
	 * @param applicationId
	 * @param jobId
	 * @returns ApplicationJob A single application
	 * @throws ApiError
	 */
	public static getApplicationJob(
		applicationId: ApplicationID,
		jobId: JobID
	): CancelablePromise<ApplicationJob> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}/jobs/{job_id}",
			path: {
				application_id: applicationId,
				job_id: jobId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application/Job is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete an application job by application and job id
	 * Cleans up the specific job from the Application and all its assoicated resources
	 * @param applicationId
	 * @param jobId
	 * @returns GenericMessageResponse Generic OK response
	 * @throws ApiError
	 */
	public static deleteApplicationJob(
		applicationId: ApplicationID,
		jobId: JobID
	): CancelablePromise<GenericMessageResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/applications/{application_id}/jobs/{job_id}",
			path: {
				application_id: applicationId,
				job_id: jobId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application/Job is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Modify an existing application job
	 * Modify an application job state
	 * @param applicationId
	 * @param jobId
	 * @param requestBody
	 * @returns ApplicationJob A modified job within an application
	 * @throws ApiError
	 */
	public static modifyApplicationJob(
		applicationId: ApplicationID,
		jobId: JobID,
		requestBody: ModifyApplicationJobRequest
	): CancelablePromise<ApplicationJob> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/applications/{application_id}/jobs/{job_id}",
			path: {
				application_id: applicationId,
				job_id: jobId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Can't modify the application job because it has bad inputs`,
				401: `Unauthorized`,
				404: `Response body when an Application/Job is not found`,
				500: `There has been an internal error`,
			},
		});
	}
}
