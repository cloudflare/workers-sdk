/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The image registry is configured to be public, so it does not have a public key
 */
export type ImageRegistryIsPublic = {
	error: ImageRegistryIsPublic.error;
};

export namespace ImageRegistryIsPublic {
	export enum error {
		IMAGE_REGISTRY_IS_PUBLIC = "IMAGE_REGISTRY_IS_PUBLIC",
	}
}
