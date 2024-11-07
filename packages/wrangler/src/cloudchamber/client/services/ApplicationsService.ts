/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { Application } from "../models/Application";
import type { ApplicationID } from "../models/ApplicationID";
import type { ApplicationJob } from "../models/ApplicationJob";
import type { ApplicationName } from "../models/ApplicationName";
import type { ApplicationStatus } from "../models/ApplicationStatus";
import type { CreateApplicationJobRequest } from "../models/CreateApplicationJobRequest";
import type { CreateApplicationRequest } from "../models/CreateApplicationRequest";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { GenericMessageResponse } from "../models/GenericMessageResponse";
import type { Image } from "../models/Image";
import type { JobID } from "../models/JobID";
import type { ListApplications } from "../models/ListApplications";
import type { ListDeploymentsV2 } from "../models/ListDeploymentsV2";
import type { ModifyApplicationJobRequest } from "../models/ModifyApplicationJobRequest";
import type { ModifyApplicationRequestBody } from "../models/ModifyApplicationRequestBody";

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
				400: `Could not create the application because of input/limits reasons, more details in the error code`,
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
	 * @param applicationId
	 * @returns Application A single application
	 * @throws ApiError
	 */
	public static getApplication(
		applicationId: ApplicationID
	): CancelablePromise<Application> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}",
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
	 * Modify an application
	 * Modifies a single application by id. Only the instances can be modified to allow scaling up/down.
	 * @param applicationId
	 * @param requestBody
	 * @returns Application Modify application response
	 * @throws ApiError
	 */
	public static modifyApplication(
		applicationId: ApplicationID,
		requestBody: ModifyApplicationRequestBody
	): CancelablePromise<Application> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/applications/{application_id}",
			path: {
				application_id: applicationId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete a single application by id
	 * Deletes a single application by id
	 * @param applicationId
	 * @returns EmptyResponse Delete application response
	 * @throws ApiError
	 */
	public static deleteApplication(
		applicationId: ApplicationID
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/applications/{application_id}",
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

	/**
	 * Get a single applications deployments
	 * Returns a single applications deployments
	 * @param applicationId
	 * @returns ListDeploymentsV2 List of deployments with their corresponding placements
	 * @throws ApiError
	 */
	public static listDeploymentsByApplication(
		applicationId: ApplicationID
	): CancelablePromise<ListDeploymentsV2> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}/deployments",
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
}
