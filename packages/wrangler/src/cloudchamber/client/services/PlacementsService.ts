/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { DeploymentID } from "../models/DeploymentID";
import type { DeploymentV2 } from "../models/DeploymentV2";
import type { ListPlacements } from "../models/ListPlacements";
import type { PlacementID } from "../models/PlacementID";
import type { PlacementWithEvents } from "../models/PlacementWithEvents";
import type { ReplaceDeploymentRequestBody } from "../models/ReplaceDeploymentRequestBody";

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
			url: "/deployments/{deployment_id}/placements",
			path: {
				deployment_id: deploymentId,
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
			url: "/placements/{placement_id}",
			path: {
				placement_id: placementId,
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
	 * @returns DeploymentV2 Deployment replaced
	 * @throws ApiError
	 */
	public static replaceDeployment(
		placementId: PlacementID,
		requestBody: ReplaceDeploymentRequestBody
	): CancelablePromise<DeploymentV2> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/placements/{placement_id}",
			path: {
				placement_id: placementId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Responses with 400 status code`,
				401: `Unauthorized`,
				404: `Placement not found`,
				500: `Deployment Replacement Error`,
			},
		});
	}
}
