/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Returned when deleting an image registry protocol and it is referenced by a resource.
 */
export type ImageRegistryProtocolIsReferencedError = {
	error: ImageRegistryProtocolIsReferencedError.error;
};

export namespace ImageRegistryProtocolIsReferencedError {
	export enum error {
		IMAGE_REGISTRY_PROTO_IS_REFERENCED = "IMAGE_REGISTRY_PROTO_IS_REFERENCED",
	}
}
