/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { DeploymentID } from "../models/DeploymentID";
import type { IPAllocationsWithFilter } from "../models/IPAllocationsWithFilter";
import type { IPType } from "../models/IPType";
import type { ListIPsIsAllocated } from "../models/ListIPsIsAllocated";
import type { PlacementID } from "../models/PlacementID";

export class IPsService {
	/**
	 * List IPs
	 * List IPs
	 * @param placementId Filter out ips that are not assigned to the specified placement, can also be known as 'alloc_id' in Nomad.
	 * @param allocated Filter out ips that are not allocated
	 * @param ipType Filter out ips by type
	 * @param deploymentId Filter out by deployment ID
	 * @returns IPAllocationsWithFilter Result of listing IPs
	 * @throws ApiError
	 */
	public static listIPs(
		placementId?: PlacementID,
		allocated?: ListIPsIsAllocated,
		ipType?: IPType,
		deploymentId?: DeploymentID
	): CancelablePromise<IPAllocationsWithFilter> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/ips",
			query: {
				placement_id: placementId,
				allocated: allocated,
				ipType: ipType,
				deployment_id: deploymentId,
			},
			errors: {
				400: `Unknown account`,
				401: `Unauthorized`,
			},
		});
	}
}
