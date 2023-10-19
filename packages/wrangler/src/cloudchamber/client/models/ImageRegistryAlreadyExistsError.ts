/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The image registry already exists
 */
export type ImageRegistryAlreadyExistsError = {
	/**
	 * The domain of the registry already exists
	 */
	error: ImageRegistryAlreadyExistsError.error;
	/**
	 * Details that might be filled depending on the error code.
	 */
	details?: Record<string, any>;
};

export namespace ImageRegistryAlreadyExistsError {
	/**
	 * The domain of the registry already exists
	 */
	export enum error {
		IMAGE_REGISTRY_ALREADY_EXISTS = "IMAGE_REGISTRY_ALREADY_EXISTS",
	}
}
