/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The registry is not allowed to be added
 */
export type ImageRegistryNotAllowedError = {
	/**
	 * The domain of the registry is not allowed to be added
	 */
	error: ImageRegistryNotAllowedError.error;
	/**
	 * Details that might be filled depending on the error code.
	 */
	details?: Record<string, any>;
};

export namespace ImageRegistryNotAllowedError {
	/**
	 * The domain of the registry is not allowed to be added
	 */
	export enum error {
		IMAGE_REGISTRY_NOT_ALLOWED = "IMAGE_REGISTRY_NOT_ALLOWED",
	}
}
