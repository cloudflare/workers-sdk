/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Deployment } from "../models/Deployment";
import type { DeploymentID } from "../models/DeploymentID";
import type { ListPlacements } from "../models/ListPlacements";
import type { PlacementID } from "../models/PlacementID";
import type { PlacementWithEvents } from "../models/PlacementWithEvents";
import type { ReplaceDeploymentRequestBody } from "../models/ReplaceDeploymentRequestBody";

import type { CancelablePromise } from "../core/CancelablePromise";
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class PlacementsService {
	/**
	 * List placements
	 * List all placements under a given deploymentID with all its events
	 * @param deploymentId
	 * @returns ListPlacements A list of placements along with its events under a deployment
	 * @throws ApiError
	 */
	public static listPlacements(
		deploymentId: DeploymentID
	): CancelablePromise<ListPlacements> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/deployments/{deploymentID}/placements",
			path: {
				deploymentID: deploymentId,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
				404: `Deployment not found`,
				500: `List Placements Error`,
			},
		});
	}

	/**
	 * Get placement
	 * A Placement represents the lifetime of a single instance of a Deployment
	 * @param placementId
	 * @returns PlacementWithEvents A specific placement along with its events
	 * @throws ApiError
	 */
	public static getPlacement(
		placementId: PlacementID
	): CancelablePromise<PlacementWithEvents> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/placements/{placementID}",
			path: {
				placementID: placementId,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
				404: `Placement not found`,
				500: `Get Placement Error`,
			},
		});
	}

	/**
	 * Replace a deployment
	 * You can stop the current placement and create a new one. The new one will have the same durable properties of the deployment, but will otherwise be like new
	 * @param placementId
	 * @param requestBody
	 * @returns Deployment Deployment replaced
	 * @throws ApiError
	 */
	public static replaceDeployment(
		placementId: PlacementID,
		requestBody: ReplaceDeploymentRequestBody
	): CancelablePromise<Deployment> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/placements/{placementID}",
			path: {
				placementID: placementId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				401: `Unauthorized`,
				404: `Placement not found`,
				500: `Deployment Replacement Error`,
			},
		});
	}
}
