/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateDeploymentRequestBody } from "../models/CreateDeploymentRequestBody";
import type { Deployment } from "../models/Deployment";
import type { DeploymentID } from "../models/DeploymentID";
import type { EmptyResponse } from "../models/EmptyResponse";
import type { Image } from "../models/Image";
import type { IPV4 } from "../models/IPV4";
import type { ListDeployments } from "../models/ListDeployments";
import type { LocationID } from "../models/LocationID";
import type { ModifyDeploymentRequestBody } from "../models/ModifyDeploymentRequestBody";
import type { PlacementID } from "../models/PlacementID";
import type { ReplaceDeploymentRequestBody } from "../models/ReplaceDeploymentRequestBody";
import type { State } from "../models/State";

import type { CancelablePromise } from "../core/CancelablePromise";
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class DeploymentsService {
	/**
	 * Create a new deployment
	 * Creates a new deployment. A Deployment represents an intent to run one container, with image, in a particular location
	 * @param requestBody
	 * @returns Deployment Deployment created
	 * @throws ApiError
	 */
	public static createDeployment(
		requestBody: CreateDeploymentRequestBody
	): CancelablePromise<Deployment> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/deployments",
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
	 * @param location Filter deployments by location
	 * @param image Filter deployments by image
	 * @param state Filter deployments by deployment state
	 * @param ipv4 Filter deployments by ipv4 address
	 * @returns ListDeployments List of deployments with their corresponding placements
	 * @throws ApiError
	 */
	public static listDeployments(
		location?: LocationID,
		image?: Image,
		state?: State,
		ipv4?: IPV4
	): CancelablePromise<ListDeployments> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/deployments",
			query: {
				location: location,
				image: image,
				state: state,
				ipv4: ipv4,
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
	 * @returns Deployment Get a specific deployment along with its respective placements
	 * @throws ApiError
	 */
	public static getDeployment(
		deploymentId: DeploymentID
	): CancelablePromise<Deployment> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/deployments/{deploymentID}",
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
	 * @returns Deployment Deployment modified
	 * @throws ApiError
	 */
	public static modifyDeployment(
		deploymentId: DeploymentID,
		requestBody: ModifyDeploymentRequestBody
	): CancelablePromise<Deployment> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/deployments/{deploymentID}",
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
	public static deleteDeployment(
		deploymentId: DeploymentID
	): CancelablePromise<EmptyResponse> {
		return __request(OpenAPI, {
			method: "DELETE",
			url: "/deployments/{deploymentID}",
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
