/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The image registry does not exist
 */
export type ImageRegistryNotFoundError = {
	error: ImageRegistryNotFoundError.error;
};

export namespace ImageRegistryNotFoundError {
	export enum error {
		IMAGE_REGISTRY_NOT_FOUND = "IMAGE_REGISTRY_NOT_FOUND",
	}
}
