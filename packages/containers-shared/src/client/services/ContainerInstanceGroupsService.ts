/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ContainerInstanceGroup } from "../models/ContainerInstanceGroup";
import type { PutContainerInstanceGroupRequestBody } from "../models/PutContainerInstanceGroupRequestBody";

export class ContainerInstanceGroupsService {
	/**
	 * Create or replace a Container Instance Group.
	 */
	public static putContainerInstanceGroup(
		namespaceId: string,
		requestBody: PutContainerInstanceGroupRequestBody
	): CancelablePromise<ContainerInstanceGroup> {
		return __request(OpenAPI, {
			method: "PUT",
			url: "/instance-groups/{namespace_id}",
			path: {
				namespace_id: namespaceId,
			},
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Could not configure the Container Instance Group because of invalid input`,
				401: `Unauthorized`,
				403: `Container Instance Groups are not enabled for this account`,
				404: `The Durable Object namespace was not found`,
				500: `There has been an internal error`,
			},
		});
	}
}
