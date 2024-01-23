/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { WhoamiResponse } from "../models/WhoamiResponse";

export class IntrospectService {
	/**
	 * Introspect the current identity
	 * Show details about the current credential and its allowed capabilities
	 * @returns WhoamiResponse Introspect the current identity response
	 * @throws ApiError
	 */
	public static showWhoami(): CancelablePromise<WhoamiResponse> {
		return __request(OpenAPI, {
			method: "GET",
			url: "/whoami",
			errors: {
				401: `Unauthorized`,
				500: `There has been an internal error`,
			},
		});
	}
}
