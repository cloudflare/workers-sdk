import type { CancelablePromise } from "../core/CancelablePromise";
import type { CompleteAccountCustomer } from "../models/CompleteAccountCustomer";
import type { ModifyMeRequestBody } from "../models/ModifyMeRequestBody";

/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";

export class AccountService {
	/**
	 * Get complete account details related to Cloudchamber
	 * Get complete account details related to Cloudchamber, like limits and available locations
	 * @returns CompleteAccountCustomer Complete account for the user
	 * @throws ApiError
	 */
	public static getMe(): CancelablePromise<CompleteAccountCustomer> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/me",
			errors: {
				401: `Unauthorized`,
				500: `There has been an internal error`,
			},
		});
	}

	/**
	 * Modify account details like defaults
	 * Modify account details like defaults
	 * @param requestBody
	 * @returns CompleteAccountCustomer Complete account for the user
	 * @throws ApiError
	 */
	public static modifyMe(
		requestBody: ModifyMeRequestBody
	): CancelablePromise<CompleteAccountCustomer> {
		return __request(OpenAPI, {
			method: "PATCH",
			url: "/me",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `Bad Request that contains a specific constant code and details object about the error.`,
				401: `Unauthorized`,
				500: `There has been an internal error`,
			},
		});
	}
}
