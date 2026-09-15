/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { OpenAPI } from "../core/OpenAPI";
import { request as __request } from "../core/request";
import type { CancelablePromise } from "../core/CancelablePromise";
import type { ContainerImagePreparation } from "../models/ContainerImagePreparation";
import type { PrepareContainerImageRequestBody } from "../models/PrepareContainerImageRequestBody";

export class ContainerImagePreparationsService {
	/**
	 * Prepare a digest-pinned managed image for the Containers runtime.
	 */
	public static prepareContainerImage(
		requestBody: PrepareContainerImageRequestBody
	): CancelablePromise<ContainerImagePreparation> {
		return __request(OpenAPI, {
			method: "POST",
			url: "/image-preparations",
			body: requestBody,
			mediaType: "application/json",
			errors: {
				400: `The image is invalid or does not exist in this account`,
				401: `Unauthorized`,
				403: `Container image preparation is not enabled for this account`,
				500: `There has been an internal error`,
			},
		});
	}
}
