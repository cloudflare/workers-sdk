/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ApplicationID } from "../models/ApplicationID";
import type { CreateDeploymentV2RequestBody } from "../models/CreateDeploymentV2RequestBody";
import type { DeploymentID } from "../models/DeploymentID";
import type { DeploymentV2 } from "../models/DeploymentV2";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { Image } from "../models/Image";
import type { IPV4 } from "../models/IPV4";
import type { ListDeploymentsV2 } from "../models/ListDeploymentsV2";
import type { LocationID } from "../models/LocationID";
import type { ModifyDeploymentV2RequestBody } from "../models/ModifyDeploymentV2RequestBody";
import type { PlacementID } from "../models/PlacementID";
import type { ReplaceDeploymentRequestBody } from "../models/ReplaceDeploymentRequestBody";
import type { State } from "../models/State";

export class DeploymentsService {
	/**
	 * Create a new deployment
	 * Creates a new deployment. A Deployment represents an intent to run one container, with image, in a particular location
	 * @param requestBody
	 * @returns DeploymentV2 Deployment created
	 * @throws ApiError
	 */
	public static createDeploymentV2(
		requestBody: CreateDeploymentV2RequestBody
	): CancelablePromise<DeploymentV2> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/deployments/v2",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Could not create the deployment because of input/limits reasons, more details in the error code`,
				401: `Unauthorized`,
				409: `Deployment already exists`,
				500: `Deployment Creation Error`,
			},
		});
	}

	/**
	 * List deployments
	 * List all deployments in the current account. Optionally filter them
	 * @param appId Filter deployments by application id
	 * @param location Filter deployments by location
	 * @param image Filter deployments by image
	 * @param state Filter deployments by deployment state
	 * @param ipv4 Filter deployments by ipv4 address
	 * @param label Filter deployments by label
	 * @returns ListDeploymentsV2 List of deployments with their corresponding placements
	 * @throws ApiError
	 */
	public static listDeploymentsV2(
		appId?: ApplicationID,
		location?: LocationID,
		image?: Image,
		state?: State,
		ipv4?: IPV4,
		label?: Array<string>
	): CancelablePromise<ListDeploymentsV2> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/deployments/v2",
			query: {
				appId: appId,
				location: location,
				image: image,
				state: state,
				ipv4: ipv4,
				label: label,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
				500: `Deployment List Error`,
			},
		});
	}

	/**
	 * Get a specific deployment
	 * Get a deployment by its deployment
	 * @param deploymentId
	 * @returns DeploymentV2 Get a specific deployment along with its respective placements
	 * @throws ApiError
	 */
	public static getDeploymentV2(
		deploymentId: DeploymentID
	): CancelablePromise<DeploymentV2> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/deployments/{deploymentID}/v2",
			path: {
				deploymentID: deploymentId,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
				404: `Deployment not found`,
				500: `Deployment Get Error`,
			},
		});
	}

	/**
	 * Modify an existing deployment
	 * Change specific properties in an existing deployment
	 * @param deploymentId
	 * @param requestBody
	 * @returns DeploymentV2 Deployment modified
	 * @throws ApiError
	 */
	public static modifyDeploymentV2(
		deploymentId: DeploymentID,
		requestBody: ModifyDeploymentV2RequestBody
	): CancelablePromise<DeploymentV2> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/deployments/{deploymentID}/v2",
			path: {
				deploymentID: deploymentId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Can't modify the deployment because it surpasses limits or it has bad input`,
				401: `Unauthorized`,
				404: `Deployment not found`,
				500: `Deployment Modification Error`,
			},
		});
	}

	/**
	 * Delete a specific deployment
	 * Delete a deployment by its deployment ID
	 * @param deploymentId
	 * @returns EmptyResponse Delete a specific deployment along with its respective placements
	 * @throws ApiError
	 */
	public static deleteDeploymentV2(
		deploymentId: DeploymentID
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/deployments/{deploymentID}/v2",
			path: {
				deploymentID: deploymentId,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
				404: `Deployment not found`,
				500: `Deployment Delete Error`,
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
			url: "/placements/{placementID}",
			path: {
				placementID: placementId,
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
