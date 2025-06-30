/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ApplicationID } from "../models/ApplicationID";
import type { ApplicationRollout } from "../models/ApplicationRollout";
import type { CreateApplicationRolloutRequest } from "../models/CreateApplicationRolloutRequest";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { RolloutID } from "../models/RolloutID";
import type { UpdateApplicationRolloutRequest } from "../models/UpdateApplicationRolloutRequest";
import type { UpdateRolloutResponse } from "../models/UpdateRolloutResponse";

export class RolloutsService {
	/**
	 * Create a new rollout for an application
	 * A rollout can be used to update the application's configuration across instances with minimal downtime.
	 * @param applicationId
	 * @param requestBody
	 * @returns ApplicationRollout
	 * @throws ApiError
	 */
	public static createApplicationRollout(
		applicationId: ApplicationID,
		requestBody: CreateApplicationRolloutRequest
	): CancelablePromise<ApplicationRollout> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/applications/{application_id}/rollouts",
			path: {
				application_id: applicationId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Can't update the application rollout because it has bad inputs`,
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * List rollouts
	 * List all rollouts within an application
	 * @param applicationId
	 * @param limit The amount of rollouts to return. By default it is all of them.
	 * @param last The last rollout that was used to paginate
	 * @returns ApplicationRollout
	 * @throws ApiError
	 */
	public static listApplicationRollouts(
		applicationId: ApplicationID,
		limit?: number,
		last?: string
	): CancelablePromise<Array<ApplicationRollout>> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}/rollouts",
			path: {
				application_id: applicationId,
			},
			query: {
				limit: limit,
				last: last,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Get a rollout by id within an application
	 * View rollout configurations and state for a specific rollout
	 * @param applicationId
	 * @param rolloutId
	 * @returns ApplicationRollout
	 * @throws ApiError
	 */
	public static getApplicationRollout(
		applicationId: ApplicationID,
		rolloutId: RolloutID
	): CancelablePromise<ApplicationRollout> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/applications/{application_id}/rollouts/{rollout_id}",
			path: {
				application_id: applicationId,
				rollout_id: rolloutId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Update a rollout within an application
	 * A rollout can be updated to modify its current state. Actions include - next, previous, rollback
	 * @param applicationId
	 * @param rolloutId
	 * @param requestBody
	 * @returns UpdateRolloutResponse
	 * @throws ApiError
	 */
	public static updateApplicationRollout(
		applicationId: ApplicationID,
		rolloutId: RolloutID,
		requestBody: UpdateApplicationRolloutRequest
	): CancelablePromise<UpdateRolloutResponse> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/applications/{application_id}/rollouts/{rollout_id}",
			path: {
				application_id: applicationId,
				rollout_id: rolloutId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Can't create the application rollout because it has bad inputs`,
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Delete a rollout within an application by its rollout id
	 * Cleans up the specific rollout from the Application if it is not in use
	 * @param applicationId
	 * @param rolloutId
	 * @returns EmptyResponse
	 * @throws ApiError
	 */
	public static deleteApplicationRollout(
		applicationId: ApplicationID,
		rolloutId: RolloutID
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/applications/{application_id}/rollouts/{rollout_id}",
			path: {
				application_id: applicationId,
				rollout_id: rolloutId,
			},
			errors: {
				401: `Unauthorized`,
				404: `Response body when an Application is not found`,
				500: `There has been an internal error`,
			},
		});
	}
}
